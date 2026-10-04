import {
  Check,
  CircleHelp,
  FileText,
  Globe,
  Layers3,
  Link2,
  Sparkles,
} from "lucide-react";
import type { Integration } from "../shared/types";
import { api } from "./api";
import { Modal } from "./components";
import { errorText } from "./format";

const ICON: Record<string, React.ReactNode> = {
  gmail: <FileText size={21} />,
  extension: <Globe size={21} />,
  gateway: <Sparkles size={21} />,
  kernel: <Layers3 size={21} />,
};

export function HelpPanel({
  integrations,
  onClose,
  onNotify,
}: {
  integrations: Integration[];
  onClose: () => void;
  onNotify: (s: string) => void;
}) {
  return (
    <Modal title="Help" onClose={onClose} wide>
      <div className="modal-body help-body">
        <h3>Getting started</h3>
        <p>
          Add data imports a card statement or receipts; you review every
          candidate before saving. Open a subscription to add usage, check in,
          confirm prices, or record a change you made yourself.
        </p>
        <h3>What the numbers mean</h3>
        <p>
          Average monthly cost divides annual plans by twelve. Scheduled
          amounts are forecasts from your billing dates, not bank charges.
          Potential savings count only confirmed prices; recorded reductions
          are changes you told Folio you made.
        </p>
        <h3>Controlled tests</h3>
        <p>
          Approved changes run in a real cloud browser against hosted test
          merchant pages, then the merchant’s state is checked independently.
          They never touch your real accounts.
        </p>
        <h3 className="help-connections">Connection details</h3>
        <div className="connection-list">
          {integrations.map((i) => (
            <div className="connection" key={i.id}>
              <span className={`connection-icon ${i.id}`}>
                {ICON[i.id] ?? <Link2 size={21} />}
              </span>
              <div>
                <strong>{i.name}</strong>
                <p>{i.description}</p>
                <small>{i.status}</small>
              </div>
              {i.id === "gmail" && i.configured ? (
                <button
                  className="button secondary compact"
                  onClick={async () => {
                    try {
                      const r = await api<{ url: string }>("/api/gmail/connect");
                      window.location.assign(r.url);
                    } catch (e) {
                      onNotify(errorText(e));
                    }
                  }}
                >
                  Connect
                </button>
              ) : i.id === "extension" ? (
                <a
                  className="button secondary compact"
                  href="/folio-extension.zip"
                  download
                >
                  Download
                </a>
              ) : (
                <span className={`badge ${i.configured ? "green" : "gray"}`}>
                  {i.configured ? <Check size={13} /> : <CircleHelp size={13} />}{" "}
                  {i.configured ? "Configured" : "Not configured"}
                </span>
              )}
            </div>
          ))}
        </div>
        <p className="small-note">
          Badges show configuration, not provider health. Browser extension:
          unzip, open chrome://extensions, enable Developer mode, and choose
          Load unpacked.
        </p>
      </div>
    </Modal>
  );
}
