// Supabase 연결 정보. 비워두면 "로컬 모드"(이 브라우저에만 저장)로 동작한다.
// anon(publishable) 키는 공개돼도 되는 키다 — 실제 보호는 supabase.sql의 RLS 정책이 한다.
// service_role(secret) 키는 절대 여기 넣지 말 것.
window.QNA_CONFIG = {
  supabaseUrl: 'https://cdcgdoknnoxnokxgpgvs.supabase.co',
  supabaseKey: 'sb_publishable_5P3VO2c2ZUpZeG-RIWN38A_XjcmJviL',
};
