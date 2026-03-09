import { CircularProgress, IconButton, TextField } from "@mui/material";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import { useState } from "react";
import { useIntl } from "react-intl";
import { nip19 } from "nostr-tools";
import { NPub } from "nostr-tools/nip19";
import { NIP05_REGEX } from "nostr-tools/nip05";

const resolveNip05 = async (
  nip05: string,
): Promise<string | null> => {
  const match = nip05.match(NIP05_REGEX);
  if (!match) return null;

  const [, name = "_", domain] = match;

  try {
    const url = `https://${domain}/.well-known/nostr.json?name=${name}`;
    const res = await (await fetch(url, { redirect: "error" })).json();
    const pubkey = res.names?.[name];
    return typeof pubkey === "string" && pubkey.length === 64
      ? pubkey
      : null;
  } catch {
    return null;
  }
};

export const ParticipantAdd = ({
  onAdd,
}: {
  onAdd: (pubKey: string) => void;
}) => {
  const [pubKey, updatePubkey] = useState("");
  const [error, updateError] = useState(false);
  const [loading, setLoading] = useState(false);
  const canSubmit = !!pubKey && !loading;
  const intl = useIntl();

  const onSubmit = async () => {
    if (!canSubmit) {
      return;
    }

    // npub
    if (pubKey.startsWith("npub")) {
      try {
        const decoded = nip19.decode(pubKey as NPub).data;
        onAdd(decoded);
        updatePubkey("");
      } catch {
        updateError(true);
      }
      return;
    }

    // NIP-05 (user@domain)
    if (NIP05_REGEX.test(pubKey)) {
      setLoading(true);
      const resolved = await resolveNip05(pubKey);
      setLoading(false);
      if (resolved) {
        onAdd(resolved);
        updatePubkey("");
      } else {
        updateError(true);
      }
      return;
    }

    // Hex pubkey
    if (pubKey.length === 64) {
      onAdd(pubKey);
      updatePubkey("");
      return;
    }

    updateError(true);
  };

  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <TextField
        error={error}
        style={{
          width: "100%",
        }}
        placeholder={intl.formatMessage({ id: "navigation.addParticipants" })}
        value={pubKey}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            onSubmit();
          }
        }}
        onChange={(e) => {
          updateError(false);
          updatePubkey(e.target.value);
        }}
      />
      <IconButton
        style={{
          height: "100%",
        }}
        disabled={!canSubmit}
        onClick={onSubmit}
      >
        {loading ? <CircularProgress size={24} /> : <PersonAddIcon />}
      </IconButton>
    </div>
  );
};
