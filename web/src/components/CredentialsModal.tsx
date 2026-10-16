import { useState } from 'react';
import { Modal } from './ui';

interface Props {
  title: string;
  values: Record<string, string>;
  onClose: () => void;
}

/** Credentials are shown exactly once, as a real platform would. */
export function CredentialsModal({ title, values, onClose }: Props) {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
    } catch {
      setCopied(null);
    }
  };

  return (
    <Modal title={title} onClose={onClose}>
      <p className="callout warning">
        These values are shown once. This demo keeps them for the current browser session so the traffic lab and directory
        can act as the company; a real platform would never store them in a browser.
      </p>
      {Object.entries(values).map(([label, value]) => (
        <div key={label} className="field">
          <span>{label}</span>
          <div className="copy-row">
            <code>{value}</code>
            <button type="button" className="button small" onClick={() => copy(label, value)}>
              {copied === label ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      ))}
      <div className="actions">
        <button type="button" className="button primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
