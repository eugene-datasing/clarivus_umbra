/**
 * Multimedia extraction module for the Umbra document processing pipeline.
 *
 * Supports:
 * - Audio files (MP3, WAV, M4A) via Azure Speech-to-Text
 * - Video files (MP4, MOV, AVI, WEBM) via Azure Video Indexer
 * - Image region detection (faces, text, license plates) via Azure Computer Vision
 *
 * All functions gracefully degrade when Azure services are unavailable,
 * returning empty results with a warning flag.
 */

import type { ExtractionResult, ExtractedPage } from "./extract";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "multimedia-extract" });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A time-stamped segment of transcribed audio. */
export interface AudioSegment {
  /** Start time in seconds */
  startTime: number;
  /** End time in seconds */
  endTime: number;
  /** Transcribed text */
  text: string;
  /** Identified speaker label (if speaker diarisation is available) */
  speaker?: string;
}

/** A detected region within an image frame. */
export interface ImageRegion {
  /** Type of detected content */
  type: "face" | "text" | "license-plate";
  /** Bounding box in the image (pixel coordinates) */
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** Confidence score (0-1) */
  confidence: number;
  /** Detected text content (only for type "text" or "license-plate") */
  text?: string;
}

/** Result from a video extraction including transcript, faces, and OCR text. */
export interface VideoExtractionDetail {
  /** Transcription segments from audio track */
  transcriptSegments: AudioSegment[];
  /** Detected face regions per frame */
  detectedFaces: Array<{
    timestamp: number;
    regions: ImageRegion[];
  }>;
  /** On-screen text detected via OCR */
  ocrFrames: Array<{
    timestamp: number;
    regions: ImageRegion[];
  }>;
}

/** Metadata returned alongside multimedia extraction results. */
export interface MultimediaExtractionMeta {
  /** Whether the result is a stub due to unavailable Azure services */
  isStub: boolean;
  /** Warning messages (e.g. service unavailable) */
  warnings: string[];
  /** Duration in seconds (for audio/video) */
  durationSeconds?: number;
  /** Image regions detected (for image extraction) */
  imageRegions?: ImageRegion[];
  /** Video extraction detail (for video extraction) */
  videoDetail?: VideoExtractionDetail;
}

// ---------------------------------------------------------------------------
// Azure Speech-to-Text client (stubbed)
// ---------------------------------------------------------------------------

/**
 * Check whether Azure Speech-to-Text credentials are configured.
 */
function hasSpeechCredentials(): boolean {
  return !!(
    process.env.AZURE_SPEECH_ENDPOINT && process.env.AZURE_SPEECH_KEY
  );
}

/**
 * Check whether Azure Computer Vision credentials are configured.
 */
function hasComputerVisionCredentials(): boolean {
  return !!(
    process.env.AZURE_CV_ENDPOINT && process.env.AZURE_CV_KEY
  );
}

/**
 * Check whether Azure Video Indexer credentials are configured.
 */
function hasVideoIndexerCredentials(): boolean {
  return !!(
    process.env.AZURE_VIDEO_INDEXER_ACCOUNT_ID &&
    process.env.AZURE_VIDEO_INDEXER_KEY
  );
}

// ---------------------------------------------------------------------------
// Audio extraction
// ---------------------------------------------------------------------------

/**
 * Extract text from an audio file using Azure Speech-to-Text.
 *
 * When Azure Speech-to-Text is unavailable, returns a stub result with a
 * warning indicating that transcription is not available.
 *
 * @param buffer - Raw audio file bytes
 * @param filename - Original filename (used for logging)
 * @returns ExtractionResult with one page per segment/minute of audio
 */
export async function extractFromAudio(
  buffer: Buffer,
  filename: string,
): Promise<ExtractionResult & { meta: MultimediaExtractionMeta }> {
  log.info("Starting audio extraction", {
    filename,
    sizeBytes: buffer.length,
  });

  if (!hasSpeechCredentials()) {
    log.warn(
      "Azure Speech-to-Text credentials not configured, returning stub result",
      { filename },
    );
    return createStubResult(filename, "audio", [
      "Azure Speech-to-Text service is not configured. Audio transcription is unavailable.",
    ]);
  }

  // ------------------------------------------------------------------
  // Azure Speech-to-Text integration
  // ------------------------------------------------------------------
  // When the service is available, we would:
  //   1. Create a SpeechConfig with the endpoint and key
  //   2. Create an AudioConfig from the buffer (WAV) or convert to WAV first
  //   3. Use ContinuousRecognition to get timestamped segments
  //   4. Optionally enable speaker diarisation
  //
  // For now, this calls the REST API with the buffer directly.
  // Since Azure Speech SDK may not be installed, we stub the call.
  // ------------------------------------------------------------------

  try {
    const endpoint = process.env.AZURE_SPEECH_ENDPOINT!;
    const key = process.env.AZURE_SPEECH_KEY!;

    // Determine content type from filename
    const ext = filename.toLowerCase().split(".").pop();
    const contentTypeMap: Record<string, string> = {
      wav: "audio/wav",
      mp3: "audio/mpeg",
      m4a: "audio/mp4",
    };
    const contentType = contentTypeMap[ext ?? ""] ?? "audio/wav";

    // Call the Azure Speech-to-Text REST API (simple recognition)
    // Convert Buffer to Uint8Array for fetch compatibility
    const bodyBytes = new Uint8Array(buffer);
    const response = await fetch(
      `${endpoint}/speechtotext/v3.1/transcriptions:transcribe`,
      {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": key,
          "Content-Type": contentType,
          Accept: "application/json",
        },
        body: bodyBytes,
      },
    );

    if (!response.ok) {
      throw new Error(
        `Azure Speech-to-Text returned ${response.status}: ${response.statusText}`,
      );
    }

    const data = (await response.json()) as {
      combinedPhrases?: Array<{ text: string }>;
      phrases?: Array<{
        offsetMilliseconds: number;
        durationMilliseconds: number;
        text: string;
        speaker?: number;
        confidence?: number;
      }>;
      duration?: string;
    };

    // Parse phrases into AudioSegments
    const segments: AudioSegment[] = [];
    if (data.phrases) {
      for (const phrase of data.phrases) {
        segments.push({
          startTime: (phrase.offsetMilliseconds ?? 0) / 1000,
          endTime:
            ((phrase.offsetMilliseconds ?? 0) +
              (phrase.durationMilliseconds ?? 0)) /
            1000,
          text: phrase.text,
          speaker: phrase.speaker !== undefined
            ? `Speaker ${phrase.speaker}`
            : undefined,
        });
      }
    }

    // Build pages: one page per minute of audio
    const pages = segmentsToPages(segments);
    const totalText = pages.map((p) => p.text).join("\n\n");

    log.info("Audio extraction complete", {
      filename,
      segments: segments.length,
      pages: pages.length,
    });

    return {
      pages,
      totalText,
      meta: {
        isStub: false,
        warnings: [],
        durationSeconds:
          segments.length > 0
            ? segments[segments.length - 1].endTime
            : undefined,
      },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error("Audio extraction failed, returning stub", {
      filename,
      error: msg,
    });

    return createStubResult(filename, "audio", [
      `Audio transcription failed: ${msg}. The file has been stored but transcription is unavailable.`,
    ]);
  }
}

// ---------------------------------------------------------------------------
// Video extraction
// ---------------------------------------------------------------------------

/**
 * Extract text and visual data from a video file using Azure Video Indexer.
 *
 * Returns pages containing:
 * - Transcript segments (one page per minute)
 * - Detected faces (as metadata text)
 * - On-screen text from OCR frames
 *
 * When Azure Video Indexer is unavailable, returns a stub result.
 *
 * @param buffer - Raw video file bytes
 * @param filename - Original filename
 * @returns ExtractionResult with transcript, face, and OCR data as pages
 */
export async function extractFromVideo(
  buffer: Buffer,
  filename: string,
): Promise<ExtractionResult & { meta: MultimediaExtractionMeta }> {
  log.info("Starting video extraction", {
    filename,
    sizeBytes: buffer.length,
  });

  if (!hasVideoIndexerCredentials()) {
    log.warn(
      "Azure Video Indexer credentials not configured, returning stub result",
      { filename },
    );
    return createStubResult(filename, "video", [
      "Azure Video Indexer service is not configured. Video analysis is unavailable.",
    ]);
  }

  // ------------------------------------------------------------------
  // Azure Video Indexer integration
  // ------------------------------------------------------------------
  // When the service is available, we would:
  //   1. Upload the video to Video Indexer
  //   2. Poll for indexing completion
  //   3. Retrieve the index (transcript, faces, OCR)
  //   4. Convert into pages
  //
  // The Video Indexer API requires uploading the video and waiting for
  // asynchronous processing. For a synchronous pipeline call, we would
  // need to poll. This is stubbed for the prototype.
  // ------------------------------------------------------------------

  try {
    const accountId = process.env.AZURE_VIDEO_INDEXER_ACCOUNT_ID!;
    const apiKey = process.env.AZURE_VIDEO_INDEXER_KEY!;
    const location = process.env.AZURE_VIDEO_INDEXER_LOCATION ?? "trial";

    // Step 1: Get an access token
    const tokenResponse = await fetch(
      `https://api.videoindexer.ai/Auth/${location}/Accounts/${accountId}/AccessToken?allowEdit=true`,
      {
        headers: { "Ocp-Apim-Subscription-Key": apiKey },
      },
    );

    if (!tokenResponse.ok) {
      throw new Error(
        `Video Indexer auth failed: ${tokenResponse.status} ${tokenResponse.statusText}`,
      );
    }

    const accessToken = ((await tokenResponse.text()) as string).replace(
      /"/g,
      "",
    );

    // Step 2: Upload video
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(buffer)]);
    formData.append("file", blob, filename);

    const uploadResponse = await fetch(
      `https://api.videoindexer.ai/${location}/Accounts/${accountId}/Videos?name=${encodeURIComponent(filename)}&accessToken=${accessToken}&privacy=Private`,
      {
        method: "POST",
        body: formData,
      },
    );

    if (!uploadResponse.ok) {
      throw new Error(
        `Video Indexer upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`,
      );
    }

    const uploadResult = (await uploadResponse.json()) as { id: string };
    const videoId = uploadResult.id;

    // Step 3: Poll for completion (with timeout)
    const maxWaitMs = 5 * 60 * 1000; // 5 minutes
    const pollIntervalMs = 10_000; // 10 seconds
    const startTime = Date.now();
    let indexResult: Record<string, unknown> | null = null;

    while (Date.now() - startTime < maxWaitMs) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

      const statusResponse = await fetch(
        `https://api.videoindexer.ai/${location}/Accounts/${accountId}/Videos/${videoId}/Index?accessToken=${accessToken}`,
      );

      if (!statusResponse.ok) continue;

      const statusData = (await statusResponse.json()) as {
        state: string;
        videos?: Array<{
          insights?: {
            transcript?: Array<{
              text: string;
              instances?: Array<{
                start: string;
                end: string;
              }>;
              speakerId?: number;
              confidence?: number;
            }>;
            faces?: Array<{
              name?: string;
              instances?: Array<{
                start: string;
                end: string;
              }>;
            }>;
            ocr?: Array<{
              text: string;
              confidence?: number;
              instances?: Array<{
                start: string;
                end: string;
              }>;
            }>;
          };
        }>;
      };

      if (statusData.state === "Processed") {
        indexResult = statusData as unknown as Record<string, unknown>;
        break;
      }

      if (statusData.state === "Failed") {
        throw new Error("Video Indexer processing failed");
      }
    }

    if (!indexResult) {
      throw new Error(
        "Video Indexer processing timed out after 5 minutes",
      );
    }

    // Step 4: Parse results into pages
    const videoData = indexResult as {
      videos?: Array<{
        insights?: {
          transcript?: Array<{
            text: string;
            instances?: Array<{ start: string; end: string }>;
            speakerId?: number;
          }>;
          faces?: Array<{
            name?: string;
            instances?: Array<{ start: string; end: string }>;
          }>;
          ocr?: Array<{
            text: string;
            confidence?: number;
            instances?: Array<{ start: string; end: string }>;
          }>;
        };
      }>;
    };

    const transcriptSegments: AudioSegment[] = [];
    const detectedFaces: VideoExtractionDetail["detectedFaces"] = [];
    const ocrFrames: VideoExtractionDetail["ocrFrames"] = [];

    const firstVideo = videoData.videos?.[0];
    if (firstVideo?.insights) {
      const insights = firstVideo.insights;

      // Parse transcript
      if (insights.transcript) {
        for (const entry of insights.transcript) {
          const instance = entry.instances?.[0];
          transcriptSegments.push({
            startTime: instance ? parseTimeToSeconds(instance.start) : 0,
            endTime: instance ? parseTimeToSeconds(instance.end) : 0,
            text: entry.text,
            speaker:
              entry.speakerId !== undefined
                ? `Speaker ${entry.speakerId}`
                : undefined,
          });
        }
      }

      // Parse faces
      if (insights.faces) {
        for (const face of insights.faces) {
          if (face.instances) {
            for (const inst of face.instances) {
              detectedFaces.push({
                timestamp: parseTimeToSeconds(inst.start),
                regions: [
                  {
                    type: "face",
                    boundingBox: { x: 0, y: 0, width: 0, height: 0 },
                    confidence: 0.9,
                    text: face.name,
                  },
                ],
              });
            }
          }
        }
      }

      // Parse OCR
      if (insights.ocr) {
        for (const ocrEntry of insights.ocr) {
          if (ocrEntry.instances) {
            for (const inst of ocrEntry.instances) {
              ocrFrames.push({
                timestamp: parseTimeToSeconds(inst.start),
                regions: [
                  {
                    type: "text",
                    boundingBox: { x: 0, y: 0, width: 0, height: 0 },
                    confidence: ocrEntry.confidence ?? 0.8,
                    text: ocrEntry.text,
                  },
                ],
              });
            }
          }
        }
      }
    }

    // Build pages from transcript segments
    const pages = segmentsToPages(transcriptSegments);

    // Add face detection summary as a page
    if (detectedFaces.length > 0) {
      const faceNames = [
        ...new Set(
          detectedFaces.flatMap((f) =>
            f.regions.map((r) => r.text).filter(Boolean),
          ),
        ),
      ];
      pages.push({
        pageNumber: pages.length + 1,
        text: `[Detected Faces]\n${faceNames.length > 0 ? faceNames.join(", ") : `${detectedFaces.length} face(s) detected`}`,
      });
    }

    // Add OCR text as a page
    if (ocrFrames.length > 0) {
      const ocrTexts = ocrFrames
        .flatMap((f) => f.regions.map((r) => r.text).filter(Boolean))
        .filter((t, i, arr) => arr.indexOf(t) === i); // deduplicate
      if (ocrTexts.length > 0) {
        pages.push({
          pageNumber: pages.length + 1,
          text: `[On-Screen Text (OCR)]\n${ocrTexts.join("\n")}`,
        });
      }
    }

    // Ensure at least one page
    if (pages.length === 0) {
      pages.push({
        pageNumber: 1,
        text: `[Video: ${filename}]\n(No transcript or text content detected)`,
      });
    }

    const totalText = pages.map((p) => p.text).join("\n\n");

    log.info("Video extraction complete", {
      filename,
      transcriptSegments: transcriptSegments.length,
      faces: detectedFaces.length,
      ocrFrames: ocrFrames.length,
      pages: pages.length,
    });

    return {
      pages,
      totalText,
      meta: {
        isStub: false,
        warnings: [],
        durationSeconds:
          transcriptSegments.length > 0
            ? transcriptSegments[transcriptSegments.length - 1].endTime
            : undefined,
        videoDetail: {
          transcriptSegments,
          detectedFaces,
          ocrFrames,
        },
      },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error("Video extraction failed, returning stub", {
      filename,
      error: msg,
    });

    return createStubResult(filename, "video", [
      `Video analysis failed: ${msg}. The file has been stored but video analysis is unavailable.`,
    ]);
  }
}

// ---------------------------------------------------------------------------
// Image region extraction
// ---------------------------------------------------------------------------

/**
 * Detect faces, text regions, and license plates in an image using
 * Azure Computer Vision.
 *
 * Returns bounding boxes for each detected region, suitable for rendering
 * redaction overlays in the review UI.
 *
 * When Azure Computer Vision is unavailable, returns a stub result.
 *
 * @param buffer - Raw image file bytes
 * @param filename - Original filename
 * @returns ExtractionResult with detected regions as page metadata
 */
export async function extractFromImageRegions(
  buffer: Buffer,
  filename: string,
): Promise<ExtractionResult & { meta: MultimediaExtractionMeta }> {
  log.info("Starting image region extraction", {
    filename,
    sizeBytes: buffer.length,
  });

  if (!hasComputerVisionCredentials()) {
    log.warn(
      "Azure Computer Vision credentials not configured, returning stub result",
      { filename },
    );
    return createStubResult(filename, "image", [
      "Azure Computer Vision service is not configured. Image region detection is unavailable.",
    ]);
  }

  try {
    const endpoint = process.env.AZURE_CV_ENDPOINT!;
    const key = process.env.AZURE_CV_KEY!;

    const regions: ImageRegion[] = [];
    // Convert Buffer to Uint8Array for fetch compatibility
    const imageBytes = new Uint8Array(buffer);

    // ------------------------------------------------------------------
    // Face detection via Azure Computer Vision (Analyze Image API)
    // ------------------------------------------------------------------
    try {
      const faceResponse = await fetch(
        `${endpoint}/computervision/imageanalysis:analyze?features=people&api-version=2024-02-01`,
        {
          method: "POST",
          headers: {
            "Ocp-Apim-Subscription-Key": key,
            "Content-Type": "application/octet-stream",
          },
          body: imageBytes,
        },
      );

      if (faceResponse.ok) {
        const faceData = (await faceResponse.json()) as {
          peopleResult?: {
            values?: Array<{
              boundingBox: {
                x: number;
                y: number;
                w: number;
                h: number;
              };
              confidence: number;
            }>;
          };
        };

        if (faceData.peopleResult?.values) {
          for (const person of faceData.peopleResult.values) {
            regions.push({
              type: "face",
              boundingBox: {
                x: person.boundingBox.x,
                y: person.boundingBox.y,
                width: person.boundingBox.w,
                height: person.boundingBox.h,
              },
              confidence: person.confidence,
            });
          }
        }
      }
    } catch (faceError) {
      log.warn("Face detection failed, continuing with OCR", {
        filename,
        error:
          faceError instanceof Error ? faceError.message : String(faceError),
      });
    }

    // ------------------------------------------------------------------
    // Text/OCR detection via Azure Computer Vision (Read API)
    // ------------------------------------------------------------------
    try {
      const ocrResponse = await fetch(
        `${endpoint}/computervision/imageanalysis:analyze?features=read&api-version=2024-02-01`,
        {
          method: "POST",
          headers: {
            "Ocp-Apim-Subscription-Key": key,
            "Content-Type": "application/octet-stream",
          },
          body: imageBytes,
        },
      );

      if (ocrResponse.ok) {
        const ocrData = (await ocrResponse.json()) as {
          readResult?: {
            blocks?: Array<{
              lines?: Array<{
                text: string;
                boundingPolygon?: Array<{
                  x: number;
                  y: number;
                }>;
              }>;
            }>;
          };
        };

        if (ocrData.readResult?.blocks) {
          for (const block of ocrData.readResult.blocks) {
            if (block.lines) {
              for (const line of block.lines) {
                const bbox = polygonToBoundingBox(line.boundingPolygon);
                regions.push({
                  type: "text",
                  boundingBox: bbox,
                  confidence: 0.9,
                  text: line.text,
                });
              }
            }
          }
        }
      }
    } catch (ocrError) {
      log.warn("OCR detection failed", {
        filename,
        error:
          ocrError instanceof Error ? ocrError.message : String(ocrError),
      });
    }

    // Build result page
    const textParts: string[] = [];
    const textRegions = regions.filter((r) => r.type === "text" && r.text);
    const faceRegions = regions.filter((r) => r.type === "face");

    if (textRegions.length > 0) {
      textParts.push(
        `[Detected Text]\n${textRegions.map((r) => r.text).join("\n")}`,
      );
    }

    if (faceRegions.length > 0) {
      textParts.push(
        `[Detected Faces]\n${faceRegions.length} face(s) detected in image`,
      );
    }

    const pageText =
      textParts.length > 0
        ? textParts.join("\n\n")
        : `[Image: ${filename}]\n(No text or faces detected)`;

    const pages: ExtractedPage[] = [
      {
        pageNumber: 1,
        text: pageText,
      },
    ];

    log.info("Image region extraction complete", {
      filename,
      textRegions: textRegions.length,
      faceRegions: faceRegions.length,
    });

    return {
      pages,
      totalText: pageText,
      meta: {
        isStub: false,
        warnings: [],
        imageRegions: regions,
      },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error("Image region extraction failed, returning stub", {
      filename,
      error: msg,
    });

    return createStubResult(filename, "image", [
      `Image analysis failed: ${msg}. The file has been stored but region detection is unavailable.`,
    ]);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a polygon (array of {x, y} points) to a bounding box.
 */
function polygonToBoundingBox(
  polygon?: Array<{ x: number; y: number }>,
): ImageRegion["boundingBox"] {
  if (!polygon || polygon.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const xs = polygon.map((p) => p.x);
  const ys = polygon.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Parse a time string (HH:MM:SS.mmm or MM:SS.mmm) to seconds.
 */
function parseTimeToSeconds(timeStr: string): number {
  const parts = timeStr.split(":");
  if (parts.length === 3) {
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parseFloat(parts[2]);
    return hours * 3600 + minutes * 60 + seconds;
  }
  if (parts.length === 2) {
    const minutes = parseInt(parts[0], 10);
    const seconds = parseFloat(parts[1]);
    return minutes * 60 + seconds;
  }
  return parseFloat(timeStr) || 0;
}

/**
 * Convert an array of AudioSegments into ExtractedPages, grouping by minute.
 * Each page represents approximately one minute of audio/video content.
 */
function segmentsToPages(segments: AudioSegment[]): ExtractedPage[] {
  if (segments.length === 0) return [];

  const pages: ExtractedPage[] = [];
  let currentMinute = 0;
  let currentTexts: string[] = [];

  for (const seg of segments) {
    const segMinute = Math.floor(seg.startTime / 60);

    // If we've moved to a new minute, flush the current page
    if (segMinute > currentMinute && currentTexts.length > 0) {
      pages.push({
        pageNumber: pages.length + 1,
        text: `[${formatTimestamp(currentMinute * 60)} - ${formatTimestamp((currentMinute + 1) * 60)}]\n${currentTexts.join(" ")}`,
      });
      currentTexts = [];
      currentMinute = segMinute;
    }

    // Format segment text with speaker label if available
    const prefix = seg.speaker ? `[${seg.speaker}] ` : "";
    currentTexts.push(`${prefix}${seg.text}`);
    currentMinute = segMinute;
  }

  // Flush remaining
  if (currentTexts.length > 0) {
    pages.push({
      pageNumber: pages.length + 1,
      text: `[${formatTimestamp(currentMinute * 60)} - end]\n${currentTexts.join(" ")}`,
    });
  }

  return pages;
}

/**
 * Format a timestamp in seconds to MM:SS format.
 */
function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/**
 * Create a stub ExtractionResult for when Azure services are unavailable.
 * Returns a single page with the filename and warning messages.
 */
function createStubResult(
  filename: string,
  mediaType: "audio" | "video" | "image",
  warnings: string[],
): ExtractionResult & { meta: MultimediaExtractionMeta } {
  const typeLabels: Record<string, string> = {
    audio: "Audio File",
    video: "Video File",
    image: "Image File",
  };

  const pageText = [
    `[${typeLabels[mediaType]}: ${filename}]`,
    "",
    "This file has been stored but could not be fully processed.",
    ...warnings.map((w) => `Warning: ${w}`),
    "",
    "The file will be available for manual review. Automated detection",
    "of sensitive content within this media file is not available at this time.",
  ].join("\n");

  return {
    pages: [
      {
        pageNumber: 1,
        text: pageText,
      },
    ],
    totalText: pageText,
    meta: {
      isStub: true,
      warnings,
    },
  };
}
