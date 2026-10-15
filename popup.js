const DEFAULTS = {
  enabled: true,
  names: ["Ryan's Fathom Notetaker"],
  autoOpenPanel: true,
  admittedCount: 0,
};
const $ = (id) => document.getElementById(id);

chrome.storage.sync.get(DEFAULTS, (s) => {
  $('enabled').checked = s.enabled;
  $('autoOpenPanel').checked = s.autoOpenPanel;
  $('names').value = s.names.join('\n');
  $('count').textContent = s.admittedCount;
});

const save = () => {
  const names = $('names').value.split('\n').map((n) => n.trim()).filter(Boolean);
  chrome.storage.sync.set(
    { enabled: $('enabled').checked, autoOpenPanel: $('autoOpenPanel').checked, names },
    () => {
      $('status').textContent = 'Saved';
      setTimeout(() => ($('status').textContent = ''), 1500);
    }
  );
};

$('save').addEventListener('click', save);
$('enabled').addEventListener('change', save);
$('autoOpenPanel').addEventListener('change', save);
