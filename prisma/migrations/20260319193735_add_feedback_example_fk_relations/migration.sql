-- AddForeignKey
ALTER TABLE "feedback_examples" ADD CONSTRAINT "feedback_examples_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_examples" ADD CONSTRAINT "feedback_examples_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_examples" ADD CONSTRAINT "feedback_examples_detectionId_fkey" FOREIGN KEY ("detectionId") REFERENCES "detections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
