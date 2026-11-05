import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({optimizeDeps:{include:['@sdv/shared/state','@sdv/shared/route']},build:{commonjsOptions:{include:[/node_modules/,/packages\/shared/]}},plugins:[react()],server:{port:5173,proxy:{'/auth':{target:'http://localhost:4000',changeOrigin:true},'/graphql':{target:'http://localhost:4000',changeOrigin:true},'/subscriptions':{target:'ws://localhost:4000',ws:true,changeOrigin:true}}}});
