async function testUrls() {
  const urls = [
    'https://formulariomedios.pages.dev/',
    'https://formulariomedios.pages.dev/nueva-solicitud',
    'https://formulariomedios.pages.dev/mis-solicitudes',
    'https://formulariomedios.pages.dev/login',
    'https://formulariomedios.pages.dev/gestion'
  ];
  console.log('Testing Cloudflare Pages URLs without _redirects:');
  for (const u of urls) {
    const res = await fetch(u, { headers: { 'Cache-Control': 'no-cache' } });
    const text = await res.text();
    const hasRootDiv = text.includes('id="root"');
    console.log(`${u} => HTTP Status: ${res.status} | Content-Type: ${res.headers.get('content-type')} | Has #root: ${hasRootDiv} | Length: ${text.length}`);
  }
}
testUrls();
