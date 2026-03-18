import { getCases } from "@/lib/data/cases";
import { getQueueDocuments } from "@/lib/data/documents";
import QueueClient from "./queue-client";

export default async function QueuePage() {
  const [queueDocuments, cases] = await Promise.all([
    getQueueDocuments(),
    getCases(),
  ]);

  return <QueueClient queueDocuments={queueDocuments} cases={cases} />;
}
