const API_BASE_URL='https://ig4s3omb7uwdfwsl64u7fhw3ta0ahxnb.lambda-url.ap-southeast-2.on.aws';
const APP_TOKEN_KEY='indo_api_app_token';       // an app's own token, this tab only
const SESSION_KEY='indo_api_session_token';     // the user's browser session
const SESSION_AT_KEY='indo_api_session_at';
const SESSION_DAYS=30;

function dropSession(){
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_AT_KEY);
  sessionStorage.removeItem(APP_TOKEN_KEY);
}

// The browser session survives tab close and lasts as long as the server session.
function sessionToken(){
  const value=localStorage.getItem(SESSION_KEY)||'';
  if(!value)return '';
  const issued=Number(localStorage.getItem(SESSION_AT_KEY)||0);
  if(issued&&Date.now()-issued>SESSION_DAYS*86400000){dropSession();return ''}
  return value;
}

const appToken=()=>sessionStorage.getItem(APP_TOKEN_KEY)||'';
const token=()=>appToken()||sessionToken();
const device=()=>{
  const ua=navigator.userAgent;
  const browser=/Edg\//.test(ua)?'Edge':/Firefox\//.test(ua)?'Firefox':/Chrome\//.test(ua)?'Chrome':/Safari\//.test(ua)?'Safari':'Web browser';
  const platform=/CrOS/.test(ua)?'ChromeOS':/Android/.test(ua)?'Android':/iPhone|iPad/.test(ua)?'iOS':/Windows/.test(ua)?'Windows':/Mac OS/.test(ua)?'macOS':/Linux/.test(ua)?'Linux':'Unknown device';
  return `${browser} on ${platform}`;
};

async function request(path,{method='GET',body,authenticated=true,keepalive=false}={}){
  const headers={Accept:'application/json'};
  if(body!==undefined)headers['Content-Type']='application/json';
  if(authenticated){const value=token();if(!value)throw Error('Please sign in again.');headers.Authorization=`Bearer ${value}`}
  let response;
  try{response=await fetch(`${API_BASE_URL}${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body),keepalive})}
  catch{throw Error('Indo Account service could not be reached. Check your connection and try again.')}
  if(response.status===204)return null;
  const payload=await response.json().catch(()=>({}));
  if(!response.ok){
    if(response.status===401&&authenticated)dropSession();
    const detail=Array.isArray(payload.detail)?payload.detail.map(item=>item.msg).join(' '):payload.detail;
    throw Error(detail||`Indo Account request failed (${response.status}).`);
  }
  return payload;
}

function remember(result){localStorage.setItem(SESSION_KEY,result.token);localStorage.setItem(SESSION_AT_KEY,String(Date.now()));return result.profile}

export const Api={
  baseUrl:API_BASE_URL,
  hasSession:()=>!!token(),
  setSession:value=>sessionStorage.setItem(APP_TOKEN_KEY,value),
  clearSession:()=>dropSession(),
  clearAppToken:()=>sessionStorage.removeItem(APP_TOKEN_KEY),
  checkIndoId:handle=>request('/api/v1/auth/indo-id/availability',{method:'POST',authenticated:false,body:{handle}}),
  requestSignupOtp:email=>request('/api/v1/auth/email-otp/request',{method:'POST',authenticated:false,body:{email}}),
  verifySignupOtp:(email,code)=>request('/api/v1/auth/email-otp/verify',{method:'POST',authenticated:false,body:{email,code}}),
  requestPasswordReset:identifier=>request('/api/v1/auth/password-reset/request',{method:'POST',authenticated:false,body:{identifier}}),
  verifyPasswordReset:(identifier,code)=>request('/api/v1/auth/password-reset/verify',{method:'POST',authenticated:false,body:{identifier,code}}),
  completePasswordReset:(resetToken,newPassword)=>request('/api/v1/auth/password-reset/complete',{method:'POST',authenticated:false,body:{reset_token:resetToken,new_password:newPassword}}),
  signup:input=>request('/api/v1/auth/signup',{method:'POST',authenticated:false,body:{...input,device:device()}}).then(remember),
  login:(identifier,password)=>request('/api/v1/auth/login',{method:'POST',authenticated:false,body:{identifier,password,device:device()}}).then(remember),
  logout:async()=>{try{if(token())await request('/api/v1/auth/logout',{method:'POST',keepalive:true})}finally{dropSession()}},
  me:()=>request('/api/v1/me'),
  update:changes=>request('/api/v1/me',{method:'PATCH',body:changes}),
  requestRecoveryEmailOtp:email=>request('/api/v1/me/recovery-email/request',{method:'POST',body:{email}}),
  verifyRecoveryEmailOtp:(email,code)=>request('/api/v1/me/recovery-email/verify',{method:'POST',body:{email,code}}),
  sync:state=>request('/api/v1/me/state',{method:'PATCH',body:state}),
  requestSecurityOtp:action=>request('/api/v1/me/security-otp/request',{method:'POST',body:{action}}),
  verifySecurityOtp:(action,code)=>request('/api/v1/me/security-otp/verify',{method:'POST',body:{action,code}}),
  setTwoStep:(enabled,verificationToken='')=>request('/api/v1/me/two-step',{method:'PATCH',body:{enabled,...(verificationToken?{verification_token:verificationToken}:{})}}),
  changePassword:(currentPassword,newPassword,verificationToken='')=>request('/api/v1/me/password',{method:'POST',body:{current_password:currentPassword,new_password:newPassword,...(verificationToken?{verification_token:verificationToken}:{})}}),
  signoutSession:sessionId=>request(`/api/v1/me/sessions/${encodeURIComponent(sessionId)}`,{method:'DELETE'}),
  signoutSessions:includeCurrent=>request(`/api/v1/me/sessions?include_current=${includeCurrent?'true':'false'}`,{method:'DELETE'}),
  exportAccountData:verificationToken=>request('/api/v1/me/export',{method:'POST',body:{verification_token:verificationToken}}),
  createSupportRequest:(category,message)=>request('/api/v1/me/support',{method:'POST',body:{category,message}}),
  listApps:()=>request('/api/v1/me/apps'),
  getApp:app=>request(`/api/v1/me/apps/${encodeURIComponent(app)}`),
  setAppStatus:(app,value)=>request(`/api/v1/me/apps/${encodeURIComponent(app)}`,{method:'PATCH',body:{status:value}}),
  authorizeApp:(app,payload)=>request(`/api/v1/me/apps/${encodeURIComponent(app)}/authorize`,{method:'POST',body:payload}),
  revokeAppSessions:app=>request(`/api/v1/me/apps/${encodeURIComponent(app)}/sessions`,{method:'DELETE'}),
  revokeAppSession:(app,sessionId)=>request(`/api/v1/me/apps/${encodeURIComponent(app)}/sessions/${encodeURIComponent(sessionId)}`,{method:'DELETE'}),
  clearAppHistory:app=>request(`/api/v1/me/apps/${encodeURIComponent(app)}/history`,{method:'DELETE'}),
  clearAppData:app=>request(`/api/v1/me/apps/${encodeURIComponent(app)}/data`,{method:'DELETE'}),
  exportApp:app=>request(`/api/v1/me/apps/${encodeURIComponent(app)}/export`),
  appIdentity:()=>request('/api/v1/app/me'),
  deleteAccount:(verificationToken='')=>request('/api/v1/me',{method:'DELETE',body:verificationToken?{verification_token:verificationToken}:{}})
};

