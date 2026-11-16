import {Store as BaseStore} from './store.js?v=20261116-sankalplogo1';
import {Api} from './api-client.js?v=20261116-sankalplogo1';

const DATABASE_KEY='indo_unified_app_table';
const ACTIVE_USER_KEY='indo_active_session';
const DEVICE_SESSION_KEY='indo_device_session_id';
const now=()=>new Date().toISOString();
const clone=value=>JSON.parse(JSON.stringify(value));
const read=()=>JSON.parse(localStorage.getItem(DATABASE_KEY)||'{"users":[],"lookups":{}}');
const write=data=>localStorage.setItem(DATABASE_KEY,JSON.stringify(data));
const activeUser=data=>data.users.find(user=>user.user_id===localStorage.getItem(ACTIVE_USER_KEY));

function addEvent(user,type,title,detail){user.security_events??=[];user.security_events.unshift({id:`evt_${crypto.randomUUID().replaceAll('-','').slice(0,14)}`,type,title,detail,created_at:now()});user.security_events=user.security_events.slice(0,30)}
function normalizeRemote(user){const current=clone(user);current.profile_photo??='';current.gender??='Prefer not to say';current.language??='kn';current.two_step??=true;current.home_address??={};current.work_address??={};current.other_address??={};current.sessions??=[];current.security_events??=[];current.oauth_connections??=[];current.invoices??=[];current.notifications={security:false,signin:false,account:false,updates:false,billing:false,news:false,...current.notifications};current.billing={company:'',gstin:'',address:'',state:'',...current.billing};current.apps??={};return current}
function mirrorRemote(user){const data=read(),normalized={...normalizeRemote(user),remote_managed:true},index=data.users.findIndex(item=>item.user_id===normalized.user_id),previous=index===-1?null:data.users[index];let currentSessionId=normalized.sessions.find(item=>item.current)?.session_id||localStorage.getItem(DEVICE_SESSION_KEY)||previous?.sessions?.find(item=>item.current)?.session_id||'';normalized.sessions=normalized.sessions.map(item=>({...item,current:!!currentSessionId&&item.session_id===currentSessionId}));if(currentSessionId&&normalized.sessions.some(item=>item.session_id===currentSessionId))localStorage.setItem(DEVICE_SESSION_KEY,currentSessionId);if(index===-1)data.users.push(normalized);else data.users[index]={...data.users[index],...normalized,password:undefined};write(data);localStorage.setItem(ACTIVE_USER_KEY,normalized.user_id);return activeUser(data)}
function clearBrowserSession(){localStorage.removeItem(ACTIVE_USER_KEY);localStorage.removeItem(DEVICE_SESSION_KEY);Api.clearSession()}
function remoteState(user){return{apps:clone(user.apps||{}),notifications:clone(user.notifications||{}),billing:clone(user.billing||{})}}
function reportSyncError(error){window.dispatchEvent(new CustomEvent('indo-api-error',{detail:error.message}))}
function syncRemote(){const user=activeUser(read());if(!Api.hasSession()||!user)return Promise.resolve(user);return Api.sync(remoteState(user)).then(mirrorRemote).catch(error=>{reportSyncError(error);throw error})}

const Store=BaseStore;
const localInit=BaseStore.init.bind(BaseStore);
const localCreate=BaseStore.create.bind(BaseStore);
const localLogin=BaseStore.login.bind(BaseStore);
const localCurrent=BaseStore.current.bind(BaseStore);
const localUpdate=BaseStore.update.bind(BaseStore);
const localUpdateAddress=BaseStore.updateAddress.bind(BaseStore);
const localSetTwoStep=BaseStore.setTwoStep.bind(BaseStore);
const localChangePassword=BaseStore.changePassword.bind(BaseStore);
const localDelete=BaseStore.deleteCurrent.bind(BaseStore);
const localUpdateApp=BaseStore.updateApp.bind(BaseStore);
const localClearAppHistory=BaseStore.clearAppHistory.bind(BaseStore);
const localClearAppData=BaseStore.clearAppData.bind(BaseStore);
const localDisconnectApp=BaseStore.disconnectApp.bind(BaseStore);
const localReconnectApp=BaseStore.reconnectApp.bind(BaseStore);

Store.init=()=>{localInit();const current=activeUser(read());if(Api.hasSession())return current||null;if(current?.remote_managed){clearBrowserSession();return null}return localCurrent()};
Store.create=async input=>mirrorRemote(await Api.signup(input));
Store.checkIndoId=handle=>Api.checkIndoId(handle);
Store.requestSignupOtp=email=>Api.requestSignupOtp(email);
Store.verifySignupOtp=(email,code)=>Api.verifySignupOtp(email,code);
Store.login=async(identifier,password)=>mirrorRemote(await Api.login(identifier,password));
Store.current=()=>{const current=activeUser(read());if(Api.hasSession())return current||null;if(current?.remote_managed){clearBrowserSession();return null}return localCurrent()};
Store.refresh=async()=>{if(!Api.hasSession())return Store.current();return mirrorRemote(await Api.me())};
Store.signout=async()=>{try{if(Api.hasSession())await Api.logout()}catch(error){}finally{clearBrowserSession()}};
Store.update=async changes=>{if(!Api.hasSession())return localUpdate(changes);return mirrorRemote(await Api.update(changes))};
Store.requestRecoveryEmailOtp=email=>Api.requestRecoveryEmailOtp(email);
Store.verifyRecoveryEmailOtp=async(email,code)=>mirrorRemote(await Api.verifyRecoveryEmailOtp(email,code));
Store.updateAddress=async(key,value)=>{if(!Api.hasSession())return localUpdateAddress(key,value);const normalized=localUpdateAddress(key,value);return Api.update({[key]:normalized}).then(user=>{mirrorRemote(user);return normalized})};
Store.requestSecurityOtp=action=>Api.requestSecurityOtp(action);
Store.verifySecurityOtp=(action,code)=>Api.verifySecurityOtp(action,code);
Store.setTwoStep=async(enabled,verificationToken='')=>{if(!Api.hasSession())return localSetTwoStep(enabled);mirrorRemote(await Api.setTwoStep(enabled,verificationToken));return!!enabled};
Store.changePassword=async(currentPassword,value,verificationToken='')=>{if(!Api.hasSession())return localChangePassword(currentPassword,value);await Api.changePassword(currentPassword,value,verificationToken);return true};
Store.updateApp=(key,changes)=>{const result=localUpdateApp(key,changes);if(Api.hasSession())syncRemote().catch(()=>{});return result};
Store.clearAppHistory=key=>{const result=localClearAppHistory(key);if(Api.hasSession())syncRemote().catch(()=>{});return result};
Store.clearAppData=key=>{const result=localClearAppData(key);if(Api.hasSession())syncRemote().catch(()=>{});return result};
Store.disconnectApp=key=>{const result=localDisconnectApp(key);if(Api.hasSession())syncRemote().catch(()=>{});return result};
Store.reconnectApp=key=>{const result=localReconnectApp(key);if(Api.hasSession())syncRemote().catch(()=>{});return result};
Store.deleteCurrent=async(verificationToken='')=>{if(Api.hasSession()){await Api.deleteAccount(verificationToken);clearBrowserSession();return}localDelete();localStorage.removeItem(DEVICE_SESSION_KEY)};

Store.signoutSession=async sessionId=>{const data=read(),user=activeUser(data);if(!user)throw Error('Please sign in again.');const session=(user.sessions||[]).find(item=>item.session_id===sessionId||item.id===sessionId),isCurrent=!!session?.current;if(Api.hasSession())await Api.signoutSession(sessionId);user.sessions=user.sessions.filter(item=>item.session_id!==sessionId&&item.id!==sessionId);addEvent(user,'session','Device signed out',`${session?.device||'A device'} was signed out.`);write(data);if(isCurrent)clearBrowserSession();return isCurrent};
Store.removeOthers=async()=>{const data=read(),user=activeUser(data);if(!user)throw Error('Please sign in again.');if(Api.hasSession()){const result=await Api.signoutSessions(false);mirrorRemote(await Api.me());return result.removed}const removed=(user.sessions||[]).filter(session=>!session.current).length;user.sessions=user.sessions.filter(session=>session.current);write(data);return removed};
Store.signoutAllDevices=async()=>{const data=read(),user=activeUser(data);if(!user)throw Error('Please sign in again.');let removed=(user.sessions||[]).length;if(Api.hasSession()){for(const key of ['SANKALPA','EYESEARCH','EYEBROWSE']){try{await Api.revokeAppSessions(key)}catch{}}removed=(await Api.signoutSessions(true)).removed}user.sessions=[];write(data);clearBrowserSession();return removed};
Store.updateNotifications=async changes=>{const data=read(),user=activeUser(data);if(!user)throw Error('Please sign in again.');const allowed=['security','signin','account','updates','billing','news'],safe=Object.fromEntries(Object.entries(changes).filter(([key,value])=>allowed.includes(key)&&typeof value==='boolean')),next={security:false,signin:false,account:false,updates:false,billing:false,news:false,...user.notifications,...safe};if(Api.hasSession()){const remote=await Api.sync({notifications:next});const saved=mirrorRemote(remote);return clone(saved.notifications)}user.notifications=next;write(data);return clone(next)};
Store.exportData=async(verificationToken='')=>{const user=Store.current();if(!user)throw Error('Please sign in again.');if(Api.hasSession())return Api.exportAccountData(verificationToken);return{export_version:'1.0',exported_at:now(),account:{user_id:user.user_id,indo_id:user.eyemail_id,account_type:user.account_type,account_status:user.account_status,created_at:user.created_at},profile:{full_name:user.full_name,nickname:user.nickname,gender:user.gender,date_of_birth:user.dob,preferred_language:user.language,profile_photo:user.profile_photo||'',recovery_email:user.secondary_email,recovery_email_verified:!!user.secondary_email_verified,mobile_number:user.phone,mobile_number_verified:!!user.phone_verified,addresses:{home:user.home_address,work:user.work_address,other:user.other_address}},apps:clone(user.apps||{}),connections:clone(user.oauth_connections||[]),sessions:clone(user.sessions||[]),security:{two_step:!!user.two_step,events:clone(user.security_events||[])},notifications:clone(user.notifications||{}),billing:clone(user.billing||{}),invoices:clone(user.invoices||[])}};
Store.createSupportRequest=(category,message)=>Api.createSupportRequest(category,message);

Store.adoptIdentity=identity=>{
  const data=read(),userId=identity.user_id;
  const minimal={user_id:userId,eyemail_id:identity.indo_id||identity.eyemail_id,full_name:identity.full_name,nickname:identity.nickname,language:identity.language,remote_managed:true,app_scoped:true,sessions:[],security_events:[],oauth_connections:[],invoices:[],notifications:{},apps:{}};
  const index=data.users.findIndex(item=>item.user_id===userId);
  if(index===-1)data.users.push(minimal);else data.users[index]={...data.users[index],...minimal};
  write(data);localStorage.setItem(ACTIVE_USER_KEY,userId);return minimal;
};

Store.localCreate=localCreate;
Store.localLogin=localLogin;

export {Store};
