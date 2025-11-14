interface DBSettingsProps {
  isDarkMode: boolean;
}

export const DBSettings: React.FC<DBSettingsProps> = ({ isDarkMode }) => (
  <section className="space-y-6">
    <div className={isDarkMode ? 'bg-slate-800' : 'bg-gray-50'}>
      <h2>DB Settings</h2>
    </div>
  </section>
);
