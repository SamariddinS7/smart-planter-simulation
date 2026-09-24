import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({root:'client',plugins:[vue(),tailwindcss()],server:{host:'0.0.0.0',port:5173,strictPort:true,proxy:{'/api':'http://127.0.0.1:3001'}},build:{outDir:'../dist/client',emptyOutDir:true}});
