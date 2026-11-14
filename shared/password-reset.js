const DATABASE_KEY='indo_unified_app_table';
const ACTIVE_USER_KEY='indo_active_session';
const DEVICE_SESSION_KEY='indo_device_session_id';
const CHALLENGE_KEY='indo_password_reset_challenge';
const now=()=>new Date().toISOString();
const read=()=>JSON.parse(localStorage.getItem(DATABASE_KEY)||'{"users":[],"lookups":{}}');
const write=data=>localStorage.setItem(DATABASE_KEY,JSON.stringify(data));

function findUser(data,identifier){const key=identifier.trim().toLowerCase(),phone=key.replace(/\D/g,'').replace(/^91(?=\d{10}$)/,'');return data.users.find(user=>user.eyemail_id===key||user.secondary_email===key||user.phone===phone)}
function challenge(){try{return JSON.parse(sessionStorage.getItem(CHALLENGE_KEY)||'null')}catch{return null}}
function maskEmail(value=''){const[local,domain]=value.split('@');if(!domain)return'Recovery email';return`${local.slice(0,2)}${'*'.repeat(Math.max(3,local.length-2))}@${domain}`}
function validPassword(value){return value.length>=8&&value.length<=64&&/[a-z]/.test(value)&&/[A-Z]/.test(value)&&/\d/.test(value)&&/[^A-Za-z0-9]/.test(value)}
function addEvent(user){user.security_events??=[];user.security_events.unshift({id:`evt_${crypto.randomUUID().replaceAll('-','').slice(0,14)}`,type:'password',title:'Password reset',detail:'Your password was reset using recovery email verification. All devices were signed out.',created_at:now()});user.security_events=user.security_events.slice(0,30)}

export const PasswordReset={
  request(identifier){const data=read(),user=findUser(data,identifier),otp=String(Math.floor(100000+Math.random()*900000));sessionStorage.removeItem(CHALLENGE_KEY);if(!user)return{found:false};sessionStorage.setItem(CHALLENGE_KEY,JSON.stringify({user_id:user.user_id,otp,expires_at:Date.now()+600000,attempts:0,verified:false}));return{found:true,destination:maskEmail(user.secondary_email),test_otp:otp,expires_in:600}},
  verify(code){const item=challenge();if(!item)throw Error('Request a new verification code.');if(Date.now()>item.expires_at){sessionStorage.removeItem(CHALLENGE_KEY);throw Error('This code has expired. Request a new code.')}if(item.attempts>=5){sessionStorage.removeItem(CHALLENGE_KEY);throw Error('Too many incorrect attempts. Request a new code.')}if(!/^\d{6}$/.test(code)||code!==item.otp){item.attempts+=1;sessionStorage.setItem(CHALLENGE_KEY,JSON.stringify(item));throw Error(`The verification code is incorrect. ${Math.max(0,5-item.attempts)} attempts remaining.`)}item.verified=true;delete item.otp;sessionStorage.setItem(CHALLENGE_KEY,JSON.stringify(item));return true},
  reset(password){const item=challenge(),data=read();if(!item?.verified||Date.now()>item.expires_at)throw Error('Verify a new code before changing your password.');const user=data.users.find(candidate=>candidate.user_id===item.user_id);if(!user){sessionStorage.removeItem(CHALLENGE_KEY);throw Error('This account is no longer available.')}if(!validPassword(password))throw Error('Use 8–64 characters with uppercase, lowercase, number, and symbol.');if(user.password===password)throw Error('Choose a password you have not used for this account.');user.password=password;user.sessions=[];addEvent(user);write(data);if(localStorage.getItem(ACTIVE_USER_KEY)===user.user_id)localStorage.removeItem(ACTIVE_USER_KEY);localStorage.removeItem(DEVICE_SESSION_KEY);sessionStorage.removeItem(CHALLENGE_KEY);return true}
};
