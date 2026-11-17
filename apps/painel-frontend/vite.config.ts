import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
// A porta 4000 pode estar ocupada em algumas máquinas; GATEWAY_URL/GATEWAY_WS apontam o proxy para outra porta.
const gateway=process.env.GATEWAY_URL||'http://localhost:4000',gatewayWs=gateway.replace(/^http/,'ws');
export default defineConfig({envDir:'../..',optimizeDeps:{include:['@sdv/shared/state','@sdv/shared/route','@sdv/shared/plate','@sdv/shared/trace']},build:{commonjsOptions:{include:[/node_modules/,/packages\/shared/]}},plugins:[react()],server:{port:5173,proxy:{'/auth':{target:gateway,changeOrigin:true},'/graphql':{target:gateway,changeOrigin:true},'/subscriptions':{target:gatewayWs,ws:true,changeOrigin:true}}}});
