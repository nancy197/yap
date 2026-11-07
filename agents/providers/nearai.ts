// NEAR AI Cloud client with TEE attestation verification (Intel TDX via DCAP + NVIDIA NRAS GPU, nonce-bound).
// Copied from our Quorum project (agents/providers/nearai.ts).
import { createHash, randomBytes } from 'node:crypto';
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const NEARAI_BASE = 'https://cloud-api.near.ai/v1';
function key() { return process.env.NEARAI_API_KEY?.trim(); }
async function api(path:string, init:RequestInit={}) {
  const token = key();
  if (!token) throw new Error('NEARAI_API_KEY is not set');
  const response = await fetch(`${NEARAI_BASE}${path}`, { signal: AbortSignal.timeout(120_000), ...init, headers:{Authorization:`Bearer ${token}`,Accept:'application/json',...init.headers} });
  if (!response.ok) throw new Error(`NEAR AI ${response.status}: ${(await response.text()).slice(0,300)}`);
  return response.json() as Promise<any>;
}
export async function chatJson(model:string, system:string, user:string, temperature=0):Promise<{content:string;promptTokens:number;completionTokens:number}> {
  const response=await api('/chat/completions',{method:'POST',headers:{'content-type':'application/json','x-no-aliasing':'true'},body:JSON.stringify({model,stream:false,response_format:{type:'json_object'},max_tokens:6000,temperature,messages:[{role:'system',content:system},{role:'user',content:user}]})});
  const content=response.choices?.[0]?.message?.content;
  if(typeof content!=='string'||!content.trim())throw new Error('NEAR AI returned an empty completion');
  return {content,promptTokens:Number(response.usage?.prompt_tokens??0),completionTokens:Number(response.usage?.completion_tokens??0)};
}
export type AttestationCheck = {name:string; passed:boolean; detail?:string};
export type AttestationResult = {verified:boolean;checks:AttestationCheck[];reportHash:string;report:unknown};
const bytes=(hex:string)=>Buffer.from(hex.replace(/^0x/i,''),'hex');
const digest=(algorithm:string,...parts:(Buffer|string)[])=>{const hash=createHash(algorithm);for(const part of parts)hash.update(part);return hash.digest();};
const parse=(value:any)=>typeof value==='string'?JSON.parse(value):value;
export function replayRtmr3(value:unknown) {
  let rtmr=Buffer.alloc(48);
  for(const event of parse(value)) {
    if(event.imr!==3) continue;
    const kind=Buffer.alloc(4);kind.writeUInt32LE(event.event_type);
    const eventDigest=digest('sha384',kind,':',Buffer.from(event.event,'utf8'),':',bytes(event.event_payload??''));
    if(event.digest && !bytes(event.digest).equals(eventDigest)) throw new Error(`event digest mismatch: ${event.event}`);
    rtmr=digest('sha384',rtmr,eventDigest);
  }
  return rtmr;
}
async function verifyReport(report:any,nonce:string,name:string,checks:AttestationCheck[],isModel:boolean) {
  const check=(label:string,passed:boolean)=>{checks.push({name:`${name}: ${label}`,passed});if(!passed) throw new Error(label);};
  const {getCollateralAndVerify}=await import('@phala/dcap-qvl');
  const verified=await getCollateralAndVerify(bytes(report.intel_quote));
  check('Intel DCAP TCB UpToDate',verified.status==='UpToDate');
  const quote=verified.report.type==='td10'?verified.report.asTd10():verified.report.type==='td15'?verified.report.asTd15()?.base:null;
  check('TDX quote',!!quote);
  check('TDX production mode',!!quote && !(quote.tdAttributes[0]&1));
  const address=bytes(report.signing_address);
  check('ECDSA signer identity',report.signing_algo==='ecdsa' && address.length===20);
  const bound=report.tls_cert_fingerprint?digest('sha256',address,bytes(report.tls_cert_fingerprint)):Buffer.concat([address,Buffer.alloc(12)]);
  check('quote binds signer and nonce',Buffer.from(quote!.reportData).equals(Buffer.concat([bound,bytes(nonce)])));
  check('echoed nonce',report.request_nonce?.toLowerCase()===nonce);
  const compose=parse(report.info.tcb_info).app_compose;
  const expected=Buffer.concat([Buffer.from([1]),digest('sha256',Buffer.from(compose,'utf8')),Buffer.alloc(15)]);
  check('MRCONFIGID binds compose',Buffer.from(quote!.mrConfigId).equals(expected));
  check('RTMR3 event log replay',replayRtmr3(report.event_log).equals(Buffer.from(quote!.rtMr3)));
  if(isModel) {
    check('GPU evidence present',!!report.nvidia_payload);
    const payload=parse(report.nvidia_payload);
    check('GPU nonce',payload.nonce?.toLowerCase()===nonce);
    const response=await fetch('https://nras.attestation.nvidia.com/v3/attest/gpu',{method:'POST',headers:{'content-type':'application/json',Accept:'application/json'},body:JSON.stringify(payload)});
    check('NVIDIA NRAS response',response.ok);
    const body=await response.json() as any;
    const jwt=body?.[0]?.[1];
    const claims=JSON.parse(Buffer.from(jwt.split('.')[1],'base64url').toString());
    check('NVIDIA GPU verdict',claims['x-nvidia-overall-att-result']===true);
  }
}
/** Fresh preflight with cryptographic quote, measurement, event, and GPU checks. */
export async function fetchAttestation(modelId:string):Promise<AttestationResult> {
  const nonce = randomBytes(32).toString('hex');
  const query = new URLSearchParams({model:modelId,provider:'near',signing_algo:'ecdsa',nonce,include_tls_fingerprint:'false'});
  const report = await api(`/attestation/report?${query}`, {headers:{'x-no-aliasing':'true'}});
  const candidates = Array.isArray(report.model_attestations) ? report.model_attestations : [];
  const checks:AttestationCheck[] = [{name:'fresh random nonce',passed:true},{name:'model candidates returned',passed:candidates.length>0}];
  if(!report.gateway_attestation) checks.push({name:'gateway attestation present',passed:false});
  else {try{await verifyReport(report.gateway_attestation,nonce,'gateway',checks,false);}catch(error){checks.push({name:'gateway verification',passed:false,detail:String(error)});}}
  for(const [index,candidate] of candidates.entries()) {
    try{await verifyReport(candidate,nonce,`model ${index}`,checks,true);}catch(error){checks.push({name:`model ${index} verification`,passed:false,detail:String(error)});}
  }
  return {verified:checks.every(c=>c.passed),checks,reportHash:sha256(JSON.stringify(report)),report};
}
export async function modelPricing():Promise<Record<string,{input:number;output:number}>> {
  const response=await api('/models');
  const result:Record<string,{input:number;output:number}>={};
  for(const model of response.data??[]) {
    const input=Number(model.pricing?.input),output=Number(model.pricing?.output);
    if(model.id && Number.isFinite(input) && Number.isFinite(output)) result[String(model.id)]={input,output};
  }
  return result;
}
/** One metered JSON completion for non-juror agents. The caller validates its own schema. */
