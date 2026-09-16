import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.jtgcraft.mobile',
  appName: 'Jtg-craft',
  webDir: 'www',
  android: {
    minWebViewVersion: '55.0.2883.91', // Chrome 55+ for Android 6+
    allowMixedContent: true,
    backgroundColor: '#0a0e1a',
    buildOptions: {
      signingType: 'apksigner'
    }
  },
  server: {
    androidScheme: 'https',
    cleartext: true
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_server',
      iconColor: '#00e5ff'
    }
  }
};

export default config;
