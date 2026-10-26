// VS Code Live Server serves static files but cannot run FlowForge's API.
// Open the working hosted app when a page is launched through Go Live.
const { protocol, hostname, port, pathname, search, hash } = window.location;
if (protocol === 'http:' && ['localhost', '127.0.0.1'].includes(hostname) && /^55\d{2}$/.test(port)) {
    const page = pathname.split('/').pop() || '';
    window.location.replace(`https://flow-forgeapp.netlify.app/${page}${search}${hash}`);
}
