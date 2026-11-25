-- CreateTable
CREATE TABLE "GuestPlayer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Anime" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,

    CONSTRAINT "Anime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterAbility" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "magnitude" DOUBLE PRECISION NOT NULL,
    "chance" DOUBLE PRECISION NOT NULL,
    "maxUses" INTEGER NOT NULL,

    CONSTRAINT "CharacterAbility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Character" (
    "id" TEXT NOT NULL,
    "animeId" TEXT NOT NULL,
    "abilityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "secondaryPositions" TEXT[],
    "rarity" TEXT NOT NULL,
    "ovr" INTEGER NOT NULL,
    "basePrice" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "tags" TEXT[],
    "velocidade" INTEGER NOT NULL,
    "finalizacao" INTEGER NOT NULL,
    "passe" INTEGER NOT NULL,
    "drible" INTEGER NOT NULL,
    "defesa" INTEGER NOT NULL,
    "fisico" INTEGER NOT NULL,
    "controle" INTEGER NOT NULL,
    "visao" INTEGER NOT NULL,
    "reflexos" INTEGER NOT NULL,
    "posicionamento" INTEGER NOT NULL,

    CONSTRAINT "Character_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "hostParticipantId" TEXT,
    "maxPlayers" INTEGER NOT NULL,
    "botSlots" INTEGER NOT NULL,
    "botLevel" TEXT NOT NULL,
    "seed" INTEGER NOT NULL,
    "queue" TEXT[],
    "queueIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomParticipant" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "playerId" TEXT,
    "name" TEXT NOT NULL,
    "isBot" BOOLEAN NOT NULL DEFAULT false,
    "botLevel" TEXT,
    "budget" INTEGER NOT NULL,
    "joinOrder" INTEGER NOT NULL,

    CONSTRAINT "RoomParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Auction" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "startingBid" INTEGER NOT NULL,
    "currentBid" INTEGER,
    "leaderId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "winnerId" TEXT,
    "finalPrice" INTEGER,
    "nextStartsAt" TIMESTAMP(3),

    CONSTRAINT "Auction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bid" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "formation" TEXT NOT NULL,
    "lineup" JSONB NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamPlayer" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "rosterIndex" INTEGER NOT NULL,

    CONSTRAINT "TeamPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tournament" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "roundsPlayed" INTEGER NOT NULL,
    "totalRounds" INTEGER NOT NULL,
    "fixtures" JSONB NOT NULL,
    "resultsRecorded" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "homeId" TEXT NOT NULL,
    "awayId" TEXT NOT NULL,
    "homeGoals" INTEGER NOT NULL,
    "awayGoals" INTEGER NOT NULL,
    "stats" JSONB NOT NULL,
    "mvpCharacterId" TEXT,
    "playedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchEvent" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "minute" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "participantId" TEXT,
    "characterId" TEXT,
    "assistCharacterId" TEXT,
    "text" TEXT NOT NULL,

    CONSTRAINT "MatchEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentStanding" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "played" INTEGER NOT NULL,
    "wins" INTEGER NOT NULL,
    "draws" INTEGER NOT NULL,
    "losses" INTEGER NOT NULL,
    "goalsFor" INTEGER NOT NULL,
    "goalsAgainst" INTEGER NOT NULL,
    "goalDiff" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,

    CONSTRAINT "TournamentStanding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Anime_name_key" ON "Anime"("name");

-- CreateIndex
CREATE INDEX "Character_animeId_idx" ON "Character"("animeId");

-- CreateIndex
CREATE UNIQUE INDEX "Room_code_key" ON "Room"("code");

-- CreateIndex
CREATE INDEX "Room_updatedAt_idx" ON "Room"("updatedAt");

-- CreateIndex
CREATE INDEX "RoomParticipant_playerId_idx" ON "RoomParticipant"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomParticipant_roomId_playerId_key" ON "RoomParticipant"("roomId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomParticipant_roomId_joinOrder_key" ON "RoomParticipant"("roomId", "joinOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Auction_roomId_index_key" ON "Auction"("roomId", "index");

-- CreateIndex
CREATE UNIQUE INDEX "Auction_roomId_characterId_key" ON "Auction"("roomId", "characterId");

-- CreateIndex
CREATE INDEX "Bid_auctionId_idx" ON "Bid"("auctionId");

-- CreateIndex
CREATE INDEX "Bid_participantId_idx" ON "Bid"("participantId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_participantId_key" ON "Team"("participantId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamPlayer_roomId_characterId_key" ON "TeamPlayer"("roomId", "characterId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamPlayer_teamId_rosterIndex_key" ON "TeamPlayer"("teamId", "rosterIndex");

-- CreateIndex
CREATE UNIQUE INDEX "Tournament_roomId_key" ON "Tournament"("roomId");

-- CreateIndex
CREATE INDEX "Match_tournamentId_round_idx" ON "Match"("tournamentId", "round");

-- CreateIndex
CREATE UNIQUE INDEX "MatchEvent_matchId_seq_key" ON "MatchEvent"("matchId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentStanding_tournamentId_participantId_key" ON "TournamentStanding"("tournamentId", "participantId");

-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_animeId_fkey" FOREIGN KEY ("animeId") REFERENCES "Anime"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_abilityId_fkey" FOREIGN KEY ("abilityId") REFERENCES "CharacterAbility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomParticipant" ADD CONSTRAINT "RoomParticipant_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomParticipant" ADD CONSTRAINT "RoomParticipant_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "GuestPlayer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "RoomParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "RoomParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamPlayer" ADD CONSTRAINT "TeamPlayer_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamPlayer" ADD CONSTRAINT "TeamPlayer_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamPlayer" ADD CONSTRAINT "TeamPlayer_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_homeId_fkey" FOREIGN KEY ("homeId") REFERENCES "RoomParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_awayId_fkey" FOREIGN KEY ("awayId") REFERENCES "RoomParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchEvent" ADD CONSTRAINT "MatchEvent_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentStanding" ADD CONSTRAINT "TournamentStanding_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentStanding" ADD CONSTRAINT "TournamentStanding_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "RoomParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Restrições extras que o Prisma não modela (não geram drift):
ALTER TABLE "RoomParticipant" ADD CONSTRAINT "RoomParticipant_budget_nonneg" CHECK ("budget" >= 0);
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "Character" ADD CONSTRAINT "Character_ovr_range" CHECK ("ovr" BETWEEN 1 AND 100);
