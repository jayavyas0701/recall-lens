// OWNER: subagent D. Settings: profile, storage, permissions, appearance, demo, AI & privacy, feedback, account.
import { motion } from 'framer-motion'
import { Settings2 } from 'lucide-react'
import { Page, PageHeader, stagger } from '@/components/common/Page'
import { ProfileSection } from './ProfileSection'
import { AppearanceSection, PermissionsSection, StorageSection } from './SystemSections'
import { AccountSection, AiPrivacySection, DemoSection, FeedbackHistorySection } from './MoreSections'

export function SettingsPage(): React.JSX.Element {
  return (
    <Page>
      <PageHeader icon={<Settings2 />} title="Settings" subtitle="Make Context Vault yours — everything stays on this device." />
      <div className="grid grid-cols-2 items-start gap-5">
        <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-5">
          <ProfileSection />
          <AppearanceSection />
          <PermissionsSection />
          <StorageSection />
        </motion.div>
        <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-5">
          <DemoSection />
          <AiPrivacySection />
          <FeedbackHistorySection />
          <AccountSection />
        </motion.div>
      </div>
    </Page>
  )
}
