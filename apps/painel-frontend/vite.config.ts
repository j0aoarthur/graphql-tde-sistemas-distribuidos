import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],server:{port:5173,proxy:{'/auth':{target:'http://localhost:4000',changeOrigin:true},'/graphql':{target:'http://localhost:4000',changeOrigin:true},'/subscriptions':{target:'ws://localhost:4000',ws:true,changeOrigin:true}}}});
