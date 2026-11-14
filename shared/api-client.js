const API_BASE_URL='https://ig4s3omb7uwdfwsl64u7fhw3ta0ahxnb.lambda-url.ap-southeast-2.on.aws';
const TOKEN_KEY='indo_api_session_token';

const token=()=>sessionStorage.getItem(TOKEN_KEY)||'';
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
    if(response.status===401&&authenticated)sessionStorage.removeItem(TOKEN_KEY);
    const detail=Array.isArray(payload.detail)?payload.detail.map(item=>item.msg).join(' '):payload.detail;
    throw Error(detail||`Indo Account request failed (${response.status}).`);
  }
  return payload;
}

function remember(result){sessionStorage.setItem(TOKEN_KEY,result.token);return result.profile}

export const Api={
  baseUrl:API_BASE_URL,
  hasSession:()=>!!token(),
  signup:input=>request('/api/v1/auth/signup',{method:'POST',authenticated:false,body:{...input,secondary_email_verified:true,device:device()}}).then(remember),
  login:(identifier,password)=>request('/api/v1/auth/login',{method:'POST',authenticated:false,body:{identifier,password,device:device()}}).then(remember),
  logout:async()=>{try{if(token())await request('/api/v1/auth/logout',{method:'POST',keepalive:true})}finally{sessionStorage.removeItem(TOKEN_KEY)}},
  me:()=>request('/api/v1/me'),
  update:changes=>request('/api/v1/me',{method:'PATCH',body:changes}),
  sync:state=>request('/api/v1/me/state',{method:'PATCH',body:state}),
  setTwoStep:enabled=>request('/api/v1/me/two-step',{method:'PATCH',body:{enabled}}),
  changePassword:(currentPassword,newPassword)=>request('/api/v1/me/password',{method:'POST',body:{current_password:currentPassword,new_password:newPassword}}),
  deleteAccount:()=>request('/api/v1/me',{method:'DELETE'})
};

