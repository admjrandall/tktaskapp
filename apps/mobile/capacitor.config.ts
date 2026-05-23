import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.taskappcrm.app',
  appName: 'Task App CRM',
  webDir: '../../dist/mobile',
  server: {
    // HTTPS scheme enforced on Android — prevents downgrade to cleartext.
    // iOS ATS enforcement is declared in ios/App/Info.plist.
    androidScheme: 'https',
    // No external navigation allowed in the offline profile.
    allowNavigation: [],
  },
  plugins: {
    Camera: {
      presentationStyle: 'fullscreen',
    },
  },
}

export default config
