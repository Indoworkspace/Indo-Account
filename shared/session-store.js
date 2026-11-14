import {Store as BaseStore} from './store.js?v=20261114-0600';

const DATABASE_KEY='indo_unified_app_table';
const ACTIVE_USER_KEY='indo_active_session';
const DEVICE_SESSION_KEY='indo_device_session_id';
const now=()=>new Date().toISOString();
const read=()=>JSON.parse(localStorage.getItem(DATABASE_KEY)||'{"users":[],"lookups":{}}');
const write=data=>localStorage.setItem(DATABASE_KEY,JSON.stringify(data));
const activeUser=data=>data.users.find(user=>user.user_id===localStorage.getItem(ACTIVE_USER_KEY));

function browserName(){const ua=navigator.userAgent;if(/Edg\//.test(ua))return'Edge';if(/Firefox\//.test(ua))return'Firefox';if(/Chrome\//.test(ua))return'Chrome';if(/Safari\//.test(ua))return'Safari';return'Web browser'}
function platformName(){const ua=navigator.userAgent;if(/CrOS/.test(ua))return'ChromeOS';if(/Android/.test(ua))return'Android';if(/iPhone|iPad/.test(ua))return'iOS';if(/Windows/.test(ua))return'Windows';if(/Mac OS/.test(ua))return'macOS';if(/Linux/.test(ua))return'Linux';return'Unknown device'}
function addEvent(user,type,title,detail){user.security_events??=[];user.security_events.unshift({id:`evt_${crypto.randomUUID().replaceAll('-','').slice(0,14)}`,type,title,detail,created_at:now()});user.security_events=user.security_events.slice(0,30)}
function ensureCurrentSession(user){let id=localStorage.getItem(DEVICE_SESSION_KEY);if(!id){id=`sess_${crypto.randomUUID().replaceAll('-','').slice(0,18)}`;localStorage.setItem(DEVICE_SESSION_KEY,id)}user.sessions??=[];user.sessions=user.sessions.filter(session=>session.id!=='sess_current');user.sessions.forEach(session=>session.current=false);let session=user.sessions.find(item=>item.id===id);if(!session){session={id,device:`${browserName()} on ${platformName()}`,app:'Indo Account',location:'India',created_at:now()};user.sessions.unshift(session)}session.current=true;session.last_active=now();return session}
function persistCurrentSession(event){const data=read(),user=activeUser(data);if(!user)return null;ensureCurrentSession(user);if(event)addEvent(user,...event);write(data);return user}

const Store=BaseStore;
const createAccount=BaseStore.create.bind(BaseStore);
const loginAccount=BaseStore.login.bind(BaseStore);
const currentAccount=BaseStore.current.bind(BaseStore);

Store.create=input=>{createAccount(input);return persistCurrentSession()};
Store.login=(identifier,password)=>{loginAccount(identifier,password);return persistCurrentSession(['signin','Signed in','A browser signed in to your Indo Account.'])};
Store.current=()=>{const user=currentAccount();return user?persistCurrentSession():null};
Store.signout=()=>{const data=read(),user=activeUser(data),sessionId=localStorage.getItem(DEVICE_SESSION_KEY);if(user){user.sessions=(user.sessions||[]).filter(session=>session.id!==sessionId);addEvent(user,'signout','Signed out','This browser signed out of your Indo Account.');write(data)}localStorage.removeItem(ACTIVE_USER_KEY)};
Store.signoutSession=sessionId=>{const data=read(),user=activeUser(data);if(!user)throw Error('Please sign in again.');const session=(user.sessions||[]).find(item=>item.id===sessionId),isCurrent=!!session?.current;user.sessions=user.sessions.filter(item=>item.id!==sessionId);addEvent(user,'session','Device signed out',`${session?.device||'A device'} was signed out.`);write(data);if(isCurrent)localStorage.removeItem(ACTIVE_USER_KEY);return isCurrent};
Store.removeOthers=()=>{const data=read(),user=activeUser(data);if(!user)throw Error('Please sign in again.');const removed=(user.sessions||[]).filter(session=>!session.current).length;user.sessions=user.sessions.filter(session=>session.current);if(removed)addEvent(user,'session','Other devices signed out',`${removed} other ${removed===1?'session was':'sessions were'} ended.`);write(data);return removed};
Store.signoutAllDevices=()=>{const data=read(),user=activeUser(data);if(!user)throw Error('Please sign in again.');const removed=(user.sessions||[]).length;user.sessions=[];addEvent(user,'session','All devices signed out',`${removed} ${removed===1?'session was':'sessions were'} ended.`);write(data);localStorage.removeItem(ACTIVE_USER_KEY);return removed};

export {Store};
