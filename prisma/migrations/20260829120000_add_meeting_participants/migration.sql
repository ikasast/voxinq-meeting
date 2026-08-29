-- Who attended a meeting, which is a different question from whose voice is in the recording.
--
-- `speaking` is what separates them. Someone can attend and never say a word, and unticking
-- them before diarization tells the diarizer how many voices to expect -- the count it is
-- worst at guessing -- without removing them from the record of who was there. The same flag
-- narrows which enrolled voice profiles are candidates for automatic naming, so a name cannot
-- be attached to a speaker who was not in the room.
--
-- A name rather than a foreign key to speaker_profiles: participants are typed freely, most
-- meetings include people who have never been enrolled, and profile names are unique anyway.
-- So a participant whose name matches a profile gains the voiceprint behaviour automatically,
-- and gains it later if that person is enrolled after the fact.
--
-- Additive, so an older release still runs against this schema.
CREATE TABLE "meeting_participants" (
    "id" TEXT NOT NULL,
    "meeting_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "speaking" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_participants_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "meeting_participants_meeting_id_idx" ON "meeting_participants"("meeting_id");

-- One row per person per meeting: the same name twice is a mistake, not two attendees.
CREATE UNIQUE INDEX "meeting_participants_meeting_id_name_key" ON "meeting_participants"("meeting_id", "name");

ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
