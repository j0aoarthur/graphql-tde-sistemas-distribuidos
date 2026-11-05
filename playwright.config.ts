import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests',testMatch:'**/*.spec.ts',workers:1,fullyParallel:false,timeout:45000,expect:{timeout:7000},use:{headless:true,locale:'pt-BR',timezoneId:'America/Bahia',launchOptions:{args:['--enable-unsafe-swiftshader']},screenshot:'only-on-failure',trace:'off'},outputDir:'test-results'});
