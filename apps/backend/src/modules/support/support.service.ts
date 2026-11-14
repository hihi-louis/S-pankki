import fs from "node:fs";
import { fileURLToPath } from "node:url";
import type { FactsCard } from "@sbank/shared";

interface Contacts {
  source: string;
  url: string;
  website: string;
  checkedOn: string;
  customerService: { finnish: string; swedish: string; hours: string };
  cardBlocking: { number: string; hours: string };
  onlineBankingBlocking: { number: string; hours: string };
  callCost: string;
  warning: string;
}

const contacts: Contacts = JSON.parse(fs.readFileSync(fileURLToPath(new URL("../../data/support-contacts.json", import.meta.url)), "utf8"));

export type SupportTopic = "general" | "card" | "netbank";

/**
 * Sipi only reads the customer's own data, so for anything else (card problems, logging in, complaints, human help)
 * the right answer is S-Pankki's customer service. The numbers come from a small file with the source and the date it was checked.
 */
export const supportService = {
  contact(topic: SupportTopic = "general") {
    const c = contacts;
    const rows: FactsCard["rows"] = [];
    if (topic === "card") rows.push({ label: "Card blocking, any time", value: c.cardBlocking.number });
    if (topic === "netbank") rows.push({ label: "Online banking IDs blocking, any time", value: c.onlineBankingBlocking.number });
    rows.push(
      { label: "S-Pankki customer service", value: c.customerService.finnish },
      { label: "In Swedish", value: c.customerService.swedish },
      { label: "Open", value: c.customerService.hours },
    );
    if (topic === "general") rows.push({ label: "Card blocking, any time", value: c.cardBlocking.number });
    const card: FactsCard = {
      type: "facts",
      title: "Contact S-Pankki",
      headline: { label: topic === "card" ? "Card blocking, 24 hours" : topic === "netbank" ? "Online banking IDs blocking, 24 hours" : "S-Pankki customer service", value: topic === "card" ? c.cardBlocking.number : topic === "netbank" ? c.onlineBankingBlocking.number : c.customerService.finnish },
      rows,
      note: `Calls cost ${c.callCost}. ${c.warning} More at ${c.website.replace("https://", "")}.`,
    };
    return {
      topic,
      customerService: c.customerService,
      cardBlocking: c.cardBlocking,
      onlineBankingBlocking: c.onlineBankingBlocking,
      callCost: c.callCost,
      warning: c.warning,
      website: c.website,
      checkedOn: c.checkedOn,
      source: c.source,
      sourceUrl: c.url,
      card,
    };
  },
};

/** One plain sentence with the right number for the topic. */
export function supportSentence(topic: SupportTopic) {
  const c = contacts;
  const phone = `S-Pankki customer service on ${c.customerService.finnish} (${c.customerService.hours}; ${c.customerService.swedish} in Swedish). Calls cost ${c.callCost}.`;
  if (topic === "card") return `I cannot block or change a card. Call the card blocking line right away on ${c.cardBlocking.number} (open ${c.cardBlocking.hours}). For anything else, contact ${phone}`;
  if (topic === "netbank") return `I cannot help with logging in or online banking IDs. If your IDs may be in someone else's hands, call ${c.onlineBankingBlocking.number} (${c.onlineBankingBlocking.hours}) to block them. Otherwise contact ${phone}`;
  return `I can only help with your spending, plans and home questions. For anything else, contact ${phone} Use only the numbers on s-pankki.fi, because fake numbers exist.`;
}
