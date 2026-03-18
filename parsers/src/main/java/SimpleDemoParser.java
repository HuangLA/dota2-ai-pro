import skadistats.clarity.Clarity;
import skadistats.clarity.processor.runner.SimpleRunner;
import skadistats.clarity.source.MappedFileSource;
import skadistats.clarity.processor.reader.OnTickStart;
import skadistats.clarity.processor.runner.Context;
import skadistats.clarity.processor.entities.OnEntityCreated;
import skadistats.clarity.processor.entities.OnEntityUpdated;
import skadistats.clarity.processor.entities.OnEntityDeleted;
import skadistats.clarity.processor.entities.UsesEntities;
import skadistats.clarity.processor.entities.Entities;
import skadistats.clarity.processor.gameevents.OnCombatLogEntry;
import skadistats.clarity.model.Entity;
import skadistats.clarity.model.FieldPath;
import skadistats.clarity.model.CombatLogEntry;
import skadistats.clarity.wire.shared.demo.proto.Demo;
import skadistats.clarity.wire.dota.common.proto.DOTAUserMessages;
import skadistats.clarity.event.Insert;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;

import java.io.File;
import java.util.*;

/**
 * Dota 2 Demo Parser using Clarity
 * Extracts comprehensive match data and outputs JSON
 * 
 * Extracted data:
 * - Match metadata (match_id, duration, winner)
 * - Hero positions (sampled every N ticks)
 * - Kill events
 * - Ward placement/destruction events
 * - Draft data (picks/bans)
 */
public class SimpleDemoParser {
    
    // Sampling configuration
    private static final int POSITION_SAMPLE_INTERVAL = 30; // Sample every 30 ticks (~1 second)
    private static final int TEAM_SLOT_COUNT = 5;
    private static final int HERO_ITEM_SLOT_PROBE_COUNT = 25;
    private static final int INVALID_ENTITY_REFERENCE = 16777215;
    private static final float FINAL_WHISTLE_EPSILON_SECONDS = 1e-3f;
    
    public static void main(String[] args) {
        if (args.length < 1) {
            System.err.println("Usage: java -jar clarity-parser.jar <replay.dem> [--minimal]");
            System.exit(1);
        }
        
        String replayPath = args[0];
        boolean minimalMode = args.length > 1 && args[1].equals("--minimal");
        
        File replayFile = new File(replayPath);
        
        if (!replayFile.exists()) {
            System.err.println("Error: Replay file not found: " + replayPath);
            outputError("File not found: " + replayPath);
            System.exit(1);
        }
        
        System.err.println("=== Clarity Dota 2 Parser ===");
        System.err.println("Replay: " + replayPath);
        System.err.println("Size: " + (replayFile.length() / 1024 / 1024) + " MB");
        System.err.println("Mode: " + (minimalMode ? "minimal" : "full"));
        System.err.println("");
        
        long startTime = System.currentTimeMillis();
        
        try {
            // First, get match metadata from file header (fast operation)
            Demo.CDemoFileInfo fileInfo = Clarity.infoForFile(replayPath);
            
            // Create main processor and run full parse
            DotaMatchProcessor processor = new DotaMatchProcessor(minimalMode);
            new SimpleRunner(new MappedFileSource(replayPath)).runWith(processor);
            
            long elapsed = System.currentTimeMillis() - startTime;
            
            System.err.println("");
            System.err.println("SUCCESS: Replay parsed in " + elapsed + " ms");
            System.err.println("Total ticks: " + processor.getTotalTicks());
            System.err.println("Position samples: " + processor.getPositionSamples().size());
            System.err.println("Kill events: " + processor.getKillEvents().size());
            System.err.println("Ward events: " + processor.getWardEvents().size());
            System.err.println("");
            
            // Build output JSON
            Map<String, Object> result = buildResult(
                fileInfo, 
                processor, 
                replayFile, 
                elapsed, 
                replayPath
            );
            
            Gson gson = new GsonBuilder().create(); // Compact JSON for production
            System.out.println(gson.toJson(result));
            
            System.exit(0);
            
        } catch (Exception e) {
            long elapsed = System.currentTimeMillis() - startTime;
            
            System.err.println("ERROR: Parse failed after " + elapsed + " ms");
            System.err.println("Message: " + e.getMessage());
            e.printStackTrace(System.err);
            
            outputError(e.getMessage());
            System.exit(1);
        }
    }
    
    private static Map<String, Object> buildResult(
            Demo.CDemoFileInfo fileInfo,
            DotaMatchProcessor processor,
            File replayFile,
            long elapsed,
            String replayPath) {
        
        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("parse_time_ms", elapsed);
        result.put("file_size_bytes", replayFile.length());
        result.put("replay_path", replayPath);
        result.put("total_ticks", processor.getTotalTicks());
        
        // Extract metadata from file info
        Map<String, Object> metadata = new HashMap<>();
        metadata.put("time_contract_version", "v1");
        metadata.put("inventory_slot_contract_version", "v2_preserve_empty_slots");
        metadata.put("ticks_per_second", 30);
        metadata.put("time_mapping", "replay_time = (m_fGameTime or tick/30); game_time = replay_time - clock_zero_time - max(total_paused_seconds - pregame_paused_seconds, 0); clock_zero_time priority: m_flGameStartTime - pregame_paused_seconds, then combatlog GAME_STATE=5, then (m_flPreGameStartTime + 90), then m_flGameStartTime");
        long fileInfoMatchId = 0L;
        if (fileInfo != null && fileInfo.hasGameInfo() && fileInfo.getGameInfo().hasDota()) {
            var dota = fileInfo.getGameInfo().getDota();
            fileInfoMatchId = dota.getMatchId();
            metadata.put("match_id", fileInfoMatchId);
            metadata.put("game_mode", dota.getGameMode());
            metadata.put("game_winner", dota.getGameWinner()); // 2=Radiant, 3=Dire
            metadata.put("leagueid", dota.getLeagueid());
            
            // Extract picks
            List<Map<String, Object>> picks = new ArrayList<>();
            for (var pickHero : dota.getPicksBansList()) {
                Map<String, Object> pick = new HashMap<>();
                pick.put("hero_id", pickHero.getHeroId());
                pick.put("team", pickHero.getTeam()); // 2=Radiant, 3=Dire
                pick.put("is_pick", pickHero.getIsPick());
                picks.add(pick);
            }
            metadata.put("picks_bans", picks);
            
            // Extract player info
            List<Map<String, Object>> players = new ArrayList<>();
            for (var player : dota.getPlayerInfoList()) {
                Map<String, Object> p = new HashMap<>();
                p.put("hero_name", player.getHeroName());
                p.put("player_name", player.getPlayerName());
                p.put("game_team", player.getGameTeam()); // 2=Radiant, 3=Dire
                players.add(p);
            }
            metadata.put("players", players);
        }
        
        // Keep match_id source stable: file header (64-bit) is authoritative.
        // Gamerules value is preserved for diagnostics only.
        if (fileInfoMatchId == 0 && processor.getMatchId() != 0) {
            metadata.put("match_id", processor.getMatchId());
        } else if (fileInfoMatchId != 0 && processor.getMatchId() != 0 && processor.getMatchId() != fileInfoMatchId) {
            metadata.put("gamerules_match_id", processor.getMatchId());
        }
        float durationSeconds = processor.hasFinalGameTime()
                ? processor.getFinalGameTime()
                : processor.getGameTime();
        if (durationSeconds > 0) {
            metadata.put("duration_seconds", durationSeconds);
        }
        if (processor.hasFinalGameTime()) {
            metadata.put("final_whistle_game_time", processor.getFinalGameTime());
            if (processor.hasFinalReplayTime()) {
                metadata.put("final_whistle_replay_time", processor.getFinalReplayTime());
            }
            metadata.put("final_whistle_source", processor.getFinalGameTimeSource());
        }
        if (processor.hasClockZeroTime()) {
            metadata.put("game_start_time", processor.getClockZeroTime());
            if (processor.hasPreGameStartTime()) {
                metadata.put("pregame_start_time", processor.getPreGameStartTime());
            }
            if (processor.hasRawGameStartTime()) {
                metadata.put("raw_game_start_time", processor.getRawGameStartTime());
            }
            if (processor.hasCombatLogGameStartTime()) {
                metadata.put("combatlog_game_start_time", processor.getCombatLogGameStartTime());
            }
            if (processor.hasPausedSecondsAtClockZero()) {
                metadata.put("pregame_paused_seconds", processor.getPausedSecondsAtClockZero());
            }
            metadata.put("clock_zero_source", processor.getClockZeroSource());
        }
        if (processor.getWinner() != 0) {
            metadata.put("winner", processor.getWinner());
        }
        metadata.put("pause_intervals", processor.getPauseIntervals());
        
        result.put("metadata", metadata);
        
        // Add position samples (hero coordinates over time)
        result.put("positions", processor.getPositionSamples());
        
        // Add kill events
        result.put("kills", processor.getKillEvents());
        
        // Add ward events
        result.put("wards", processor.getWardEvents());

        // Add economy timeline samples
        result.put("economy", processor.getEconomySamples());
        
        // Add hero mapping (hero_id -> hero_name)
        result.put("heroes", processor.getHeroMapping());
        
        return result;
    }
    
    private static void outputError(String message) {
        Map<String, Object> result = new HashMap<>();
        result.put("success", false);
        result.put("error", message);
        
        Gson gson = new GsonBuilder().create();
        System.out.println(gson.toJson(result));
    }
    
    /**
     * Main processor for extracting Dota 2 match data
     */
    @UsesEntities
    public static class DotaMatchProcessor {
        
        @Insert
        private Entities entities;
        
        private boolean minimalMode;
        private int totalTicks = 0;
        private int lastSampledTick = -POSITION_SAMPLE_INTERVAL;
        
        // Match metadata
        private long matchId = 0;
        private float gameTime = 0;
        private Float currentGameRulesTime = null; // pause-aware gamerules clock snapshot
        private float currentTotalPausedSeconds = 0;
        private boolean currentGamePaused = false;
        private float rawGameStartTime = 0; // m_flGameStartTime
        private boolean hasRawGameStartTime = false;
        private float preGameStartTime = 0; // m_flPreGameStartTime
        private boolean hasPreGameStartTime = false;
        private float combatLogGameStartTime = 0; // combatlog GAME_STATE=5 timestamp
        private boolean hasCombatLogGameStartTime = false;
        private float pausedSecondsAtClockZero = 0;
        private boolean hasPausedSecondsAtClockZero = false;
        private float clockZeroTime = 0; // Source time where game clock should be 0:00
        private boolean hasClockZeroTime = false;
        private String clockZeroSource = "unknown";
        private int winner = 0; // 2=Radiant, 3=Dire
        private float finalGameTime = 0;
        private boolean hasFinalGameTime = false;
        private float finalGameStateTime = 0;
        private boolean hasFinalGameStateTime = false;
        private float finalGameStateReplayTime = 0;
        private float finalWinnerTime = 0;
        private boolean hasFinalWinnerTime = false;
        private float finalWinnerReplayTime = 0;
        private float finalReplayTime = 0;
        private boolean hasFinalReplayTime = false;
        private Integer lastWinnerState = null;
        private int lastGameState = 0;
        private String finalGameTimeSource = "";
        
        // Collected data
        private List<Map<String, Object>> positionSamples = new ArrayList<>();
        private List<Map<String, Object>> killEvents = new ArrayList<>();
        private List<Map<String, Object>> wardEvents = new ArrayList<>();
        private List<Map<String, Object>> economySamples = new ArrayList<>();
        private Map<Integer, String> heroMapping = new HashMap<>();

        // Team-level entities for economy extraction
        private Entity dataRadiantEntity = null;
        private Entity dataDireEntity = null;
        
        // Track known heroes by entity handle
        private Map<Integer, HeroState> trackedHeroes = new HashMap<>();

        // Cache item slot field names per hero DT class once discovered.
        private Map<String, List<String>> heroItemSlotProperties = new HashMap<>();
        
        // Track which hero+team combinations we've already seen (to filter illusions)
        // Key: "HeroName_Team" (e.g., "Spectre_3"), Value: first entity handle
        private Map<String, Integer> firstHeroHandle = new HashMap<>();

        // Keep per-sample gamerules clock snapshots so we can recompute
        // all game_time values against one consistent basis later.
        private IdentityHashMap<Map<String, Object>, Float> gameRulesTimeSnapshots = new IdentityHashMap<>();
        private IdentityHashMap<Map<String, Object>, Float> totalPausedSecondsSnapshots = new IdentityHashMap<>();
        private IdentityHashMap<Map<String, Object>, Boolean> gamePausedSnapshots = new IdentityHashMap<>();

        // Pause intervals in replay-time domain.
        private List<Map<String, Object>> pauseIntervals = new ArrayList<>();
        private boolean pauseIntervalActive = false;
        private float pauseIntervalStartReplayTime = 0;
        private float pauseIntervalStartGameTime = 0;
        private float lastObservedReplayTime = 0;
        private Float previousTotalPausedSeconds = null;
        private boolean postGameSamplesTrimmed = false;
        
        public DotaMatchProcessor(boolean minimalMode) {
            this.minimalMode = minimalMode;
        }
        
        @OnTickStart
        public void onTickStart(Context ctx, boolean synthetic) {
            totalTicks++;
            lastObservedReplayTime = getReplayTime(ctx.getTick(), currentGameRulesTime);
            
            // Sample hero positions at regular intervals
            if (!minimalMode && (totalTicks - lastSampledTick) >= POSITION_SAMPLE_INTERVAL) {
                lastSampledTick = totalTicks;
                sampleHeroPositions(ctx);
            }
        }
        
        @OnEntityCreated(classPattern = "CDOTAGamerulesProxy")
        public void onGameRulesCreated(Context ctx, Entity e) {
            updateGameRules(ctx, e);
        }
        
        @OnEntityUpdated(classPattern = "CDOTAGamerulesProxy")
        public void onGameRulesUpdated(Context ctx, Entity e, FieldPath[] changedPaths, int numChanges) {
            updateGameRules(ctx, e);
        }

        @OnEntityCreated(classPattern = "CDOTA_DataRadiant")
        public void onDataRadiantCreated(Context ctx, Entity e) {
            dataRadiantEntity = e;
        }

        @OnEntityCreated(classPattern = "CDOTA_DataDire")
        public void onDataDireCreated(Context ctx, Entity e) {
            dataDireEntity = e;
        }

        @OnEntityDeleted(classPattern = "CDOTA_DataRadiant")
        public void onDataRadiantDeleted(Context ctx, Entity e) {
            if (dataRadiantEntity != null && e != null && dataRadiantEntity.getHandle() == e.getHandle()) {
                dataRadiantEntity = null;
            }
        }

        @OnEntityDeleted(classPattern = "CDOTA_DataDire")
        public void onDataDireDeleted(Context ctx, Entity e) {
            if (dataDireEntity != null && e != null && dataDireEntity.getHandle() == e.getHandle()) {
                dataDireEntity = null;
            }
        }
        
        private void updateGameRules(Context ctx, Entity e) {
            try {
                // Try to get game time
                Object gameTimeObj = getPropertySafe(e, "m_pGameRules.m_fGameTime");
                if (gameTimeObj != null) {
                    currentGameRulesTime = ((Number) gameTimeObj).floatValue();
                }

                Object preGameStartTimeObj = getPropertySafe(e, "m_pGameRules.m_flPreGameStartTime");
                if (preGameStartTimeObj != null) {
                    preGameStartTime = ((Number) preGameStartTimeObj).floatValue();
                    hasPreGameStartTime = true;
                }

                // Try to get creep-spawn anchor (game clock = 0:00)
                Object gameStartTimeObj = getPropertySafe(e, "m_pGameRules.m_flGameStartTime");
                if (gameStartTimeObj != null) {
                    rawGameStartTime = ((Number) gameStartTimeObj).floatValue();
                    hasRawGameStartTime = true;
                }

                Object gameStateObj = getPropertySafe(e, "m_pGameRules.m_nGameState");
                int gameState = gameStateObj != null ? ((Number) gameStateObj).intValue() : 0;

                Object totalPausedTicksObj = getPropertySafe(e, "m_pGameRules.m_nTotalPausedTicks");
                float totalPausedSeconds = currentTotalPausedSeconds;
                if (totalPausedTicksObj != null) {
                    totalPausedSeconds = ((Number) totalPausedTicksObj).floatValue() / 30.0f;
                }
                currentTotalPausedSeconds = totalPausedSeconds;

                Object gamePausedObj = getPropertySafe(e, "m_pGameRules.m_bGamePaused");
                if (gamePausedObj != null) {
                    if (gamePausedObj instanceof Boolean) {
                        currentGamePaused = (Boolean) gamePausedObj;
                    } else {
                        currentGamePaused = ((Number) gamePausedObj).intValue() != 0;
                    }
                }

                if (gameState == 5 && !hasPausedSecondsAtClockZero && totalPausedTicksObj != null) {
                    pausedSecondsAtClockZero = totalPausedSeconds;
                    hasPausedSecondsAtClockZero = true;
                }

                float previousClockZeroTime = clockZeroTime;
                boolean hadClockZeroTime = hasClockZeroTime;
                if (hasRawGameStartTime && hasPausedSecondsAtClockZero) {
                    clockZeroTime = rawGameStartTime - pausedSecondsAtClockZero;
                    hasClockZeroTime = true;
                    clockZeroSource = "raw_game_start_minus_pregame_pauses";
                } else if (hasCombatLogGameStartTime) {
                    clockZeroTime = combatLogGameStartTime;
                    hasClockZeroTime = true;
                    clockZeroSource = "combatlog_game_state_5";
                } else if (hasPreGameStartTime) {
                    // Dota pregame lasts 90 seconds before creep spawn at 0:00.
                    clockZeroTime = preGameStartTime + 90.0f;
                    hasClockZeroTime = true;
                    clockZeroSource = "pregame_plus_90";
                } else if (hasRawGameStartTime) {
                    clockZeroTime = rawGameStartTime;
                    hasClockZeroTime = true;
                    clockZeroSource = "raw_game_start";
                }

                if (hasClockZeroTime) {
                    boolean firstClockZeroTimeSeen = !hadClockZeroTime;
                    boolean clockZeroTimeChanged = hadClockZeroTime
                            && Float.compare(previousClockZeroTime, clockZeroTime) != 0;
                    if (firstClockZeroTimeSeen || clockZeroTimeChanged) {
                        recalculateGameTimes(positionSamples);
                        recalculateGameTimes(wardEvents);
                        recalculateGameTimes(economySamples);
                    }
                }

                int tick = ctx != null ? ctx.getTick() : totalTicks;
                float replayTime = getReplayTime(tick, currentGameRulesTime);
                lastObservedReplayTime = replayTime;
                gameTime = getCurrentGameClock(tick, currentGameRulesTime, currentTotalPausedSeconds, currentGamePaused);
                updatePauseIntervals(replayTime, gameTime, currentGamePaused, currentTotalPausedSeconds);

                if (!hasFinalGameStateTime && lastGameState == 5 && gameState > 5) {
                    finalGameStateTime = gameTime;
                    hasFinalGameStateTime = true;
                    finalGameStateReplayTime = replayTime;
                }
                lastGameState = gameState;
                
                // Try to get match ID
                Object matchIdObj = getPropertySafe(e, "m_pGameRules.m_unMatchID64");
                if (matchIdObj != null) {
                    matchId = ((Number) matchIdObj).longValue();
                }
                
                // Try to get winner
                Object winnerObj = getPropertySafe(e, "m_pGameRules.m_nGameWinner");
                if (winnerObj != null) {
                    int newWinner = ((Number) winnerObj).intValue();
                    winner = newWinner;
                    if ((newWinner == 2 || newWinner == 3)
                            && (lastWinnerState == null || lastWinnerState <= 1)) {
                        finalWinnerTime = gameTime;
                        hasFinalWinnerTime = true;
                        finalWinnerReplayTime = replayTime;
                    }
                    lastWinnerState = newWinner;
                }

                if (hasFinalWinnerTime) {
                    finalGameTime = finalWinnerTime;
                    hasFinalGameTime = true;
                    finalReplayTime = finalWinnerReplayTime;
                    hasFinalReplayTime = true;
                    finalGameTimeSource = "winner_transition";
                } else if (hasFinalGameStateTime) {
                    finalGameTime = finalGameStateTime;
                    hasFinalGameTime = true;
                    finalReplayTime = finalGameStateReplayTime;
                    hasFinalReplayTime = true;
                    finalGameTimeSource = "game_state_transition";
                }
            } catch (Exception ex) {
                // Property access can fail, ignore
            }
        }
        
        @OnEntityCreated(classPattern = "CDOTA_Unit_Hero_.*")
        public void onHeroCreated(Context ctx, Entity hero) {
            if (hero == null) return;
            
            String dtName = hero.getDtClass().getDtName();
            int handle = hero.getHandle();
            
            // Extract hero name from class name
            String heroName = dtName.replace("CDOTA_Unit_Hero_", "");
            
            // Get team (2=Radiant, 3=Dire)
            int team = 0;
            Object teamObj = getPropertySafe(hero, "m_iTeamNum");
            if (teamObj != null) {
                team = ((Number) teamObj).intValue();
            }
            
            // Create unique key for this hero+team combination
            String heroKey = heroName + "_" + team;
            
            // Only track the FIRST entity of each hero+team combination
            // Real heroes are created first, illusions are created later
            if (firstHeroHandle.containsKey(heroKey)) {
                // This is an illusion (duplicate hero entity for same team)
                System.err.println("Skipping illusion: " + heroName + " (team " + team + ", handle " + handle + ")");
                return;
            }
            
            // Record this as the first (real) hero
            firstHeroHandle.put(heroKey, handle);
            
            // Store hero state
            HeroState state = new HeroState();
            state.heroName = heroName;
            state.team = team;
            state.handle = handle;
            trackedHeroes.put(handle, state);
            
            // Build hero mapping
            heroMapping.put(handle, heroName);
            
            System.err.println("Hero created: " + heroName + " (team " + team + ", handle " + handle + ")");
        }
        
        @OnEntityDeleted(classPattern = "CDOTA_Unit_Hero_.*")
        public void onHeroDeleted(Context ctx, Entity hero) {
            if (hero != null) {
                trackedHeroes.remove(hero.getHandle());
            }
        }
        
        // Ward tracking
        @OnEntityCreated(classPattern = "CDOTA_NPC_Observer_Ward.*")
        public void onWardCreated(Context ctx, Entity ward) {
            if (ward == null || minimalMode) return;
            
            String dtName = ward.getDtClass().getDtName();
            boolean isObserver = !dtName.contains("TrueSight");
            
            Map<String, Object> wardEvent = new HashMap<>();
            wardEvent.put("type", "placed");
            wardEvent.put("ward_type", isObserver ? "observer" : "sentry");
            wardEvent.put("tick", ctx.getTick());
            wardEvent.put("game_time", getCurrentGameClock(ctx.getTick(), currentGameRulesTime, currentTotalPausedSeconds, currentGamePaused));
            wardEvent.put("handle", ward.getHandle());
            snapshotTimingState(wardEvent, currentGameRulesTime, currentTotalPausedSeconds, currentGamePaused);
            
            // Get position
            float[] pos = getEntityPosition(ward);
            if (pos != null) {
                wardEvent.put("x", pos[0]);
                wardEvent.put("y", pos[1]);
            }
            
            // Get team
            Object teamObj = getPropertySafe(ward, "m_iTeamNum");
            if (teamObj != null) {
                wardEvent.put("team", ((Number) teamObj).intValue());
            }
            
            wardEvents.add(wardEvent);
        }
        
        @OnEntityDeleted(classPattern = "CDOTA_NPC_Observer_Ward.*")
        public void onWardDeleted(Context ctx, Entity ward) {
            if (ward == null || minimalMode) return;
            
            String dtName = ward.getDtClass().getDtName();
            boolean isObserver = !dtName.contains("TrueSight");
            
            Map<String, Object> wardEvent = new HashMap<>();
            wardEvent.put("type", "destroyed");
            wardEvent.put("ward_type", isObserver ? "observer" : "sentry");
            wardEvent.put("tick", ctx.getTick());
            wardEvent.put("game_time", getCurrentGameClock(ctx.getTick(), currentGameRulesTime, currentTotalPausedSeconds, currentGamePaused));
            wardEvent.put("handle", ward.getHandle());
            snapshotTimingState(wardEvent, currentGameRulesTime, currentTotalPausedSeconds, currentGamePaused);
            
            wardEvents.add(wardEvent);
        }
        
        // Combat log for kills
        @OnCombatLogEntry
        public void onCombatLogEntry(CombatLogEntry cle) {
            if (minimalMode) return;
            
            try {
                // Check for death events
                if (cle.getType() == DOTAUserMessages.DOTA_COMBATLOG_TYPES.DOTA_COMBATLOG_DEATH) {
                    // Only track hero deaths (not creeps, buildings, etc.)
                    if (cle.isTargetHero() && !cle.isTargetIllusion()) {
                        Map<String, Object> killEvent = new HashMap<>();
                        killEvent.put("type", "kill");
                        killEvent.put("time", cle.getTimestamp());
                        killEvent.put("killer", cle.getAttackerName());
                        killEvent.put("victim", cle.getTargetName());
                        
                        // Add location if available
                        if (cle.hasLocationX() && cle.hasLocationY()) {
                            killEvent.put("x", cle.getLocationX());
                            killEvent.put("y", cle.getLocationY());
                        }
                        
                        // Add assist player indices (0-9 = player slot)
                        if (cle.hasAssistPlayers()) {
                            killEvent.put("assist_players", cle.getAssistPlayers());
                        }
                        
                        killEvents.add(killEvent);
                    }
                }

                if (cle.getType() == DOTAUserMessages.DOTA_COMBATLOG_TYPES.DOTA_COMBATLOG_GAME_STATE
                        && cle.getValue() == 5) {
                    float newCombatLogGameStartTime = cle.getTimestamp();
                    boolean firstSeen = !hasCombatLogGameStartTime;
                    boolean changed = hasCombatLogGameStartTime
                            && Float.compare(combatLogGameStartTime, newCombatLogGameStartTime) != 0;

                    combatLogGameStartTime = newCombatLogGameStartTime;
                    hasCombatLogGameStartTime = true;

                    float previousClockZeroTime = clockZeroTime;
                    boolean hadClockZeroTime = hasClockZeroTime;
                    clockZeroTime = combatLogGameStartTime;
                    hasClockZeroTime = true;
                    clockZeroSource = "combatlog_game_state_5";

                    if (firstSeen || changed || !hadClockZeroTime
                            || Float.compare(previousClockZeroTime, clockZeroTime) != 0) {
                        recalculateGameTimes(positionSamples);
                        recalculateGameTimes(wardEvents);
                        recalculateGameTimes(economySamples);
                    }
                }
            } catch (Exception e) {
                // Combat log entry access can fail, ignore
            }
        }
        
        private void sampleHeroPositions(Context ctx) {
            int tick = ctx.getTick();
            Float gameRulesTimeSnapshot = currentGameRulesTime;
            float totalPausedSecondsSnapshot = currentTotalPausedSeconds;
            boolean gamePausedSnapshot = currentGamePaused;
            float gameClock = getCurrentGameClock(tick, gameRulesTimeSnapshot, totalPausedSecondsSnapshot, gamePausedSnapshot);
            
            for (HeroState heroState : trackedHeroes.values()) {
                try {
                    Entity hero = entities.getByHandle(heroState.handle);
                    if (hero == null) continue;
                    
                    float[] pos = getEntityPosition(hero);
                    if (pos == null) continue;
                    
                    Map<String, Object> sample = new HashMap<>();
                    sample.put("tick", tick);
                    sample.put("game_time", gameClock);
                    sample.put("hero", heroState.heroName);
                    sample.put("handle", heroState.handle);
                    sample.put("team", heroState.team);
                    sample.put("x", pos[0]);
                    sample.put("y", pos[1]);
                    
                    // Try to get additional stats
                    Object hp = getPropertySafe(hero, "m_iHealth");
                    Object maxHp = getPropertySafe(hero, "m_iMaxHealth");
                    Object mana = getPropertySafe(hero, "m_flMana");
                    Object maxMana = getPropertySafe(hero, "m_flMaxMana");
                    Object level = getPropertySafe(hero, "m_iCurrentLevel");
                    
                    if (hp != null) sample.put("hp", ((Number) hp).intValue());
                    if (maxHp != null) sample.put("max_hp", ((Number) maxHp).intValue());
                    if (mana != null) sample.put("mana", ((Number) mana).floatValue());
                    if (maxMana != null) sample.put("max_mana", ((Number) maxMana).floatValue());
                    if (level != null) sample.put("level", ((Number) level).intValue());

                    List<String> items = extractHeroItems(hero);
                    if (!items.isEmpty()) {
                        sample.put("items", items);
                    }
                    
                    positionSamples.add(sample);
                    snapshotTimingState(sample, gameRulesTimeSnapshot, totalPausedSecondsSnapshot, gamePausedSnapshot);
                    
                } catch (Exception e) {
                    // Entity access can fail, skip this sample
                }
            }

            sampleEconomyData(
                    tick,
                    gameClock,
                    gameRulesTimeSnapshot,
                    totalPausedSecondsSnapshot,
                    gamePausedSnapshot
            );
        }

        private void sampleEconomyData(
                int tick,
                float gameClock,
                Float gameRulesTimeSnapshot,
                float totalPausedSecondsSnapshot,
                boolean gamePausedSnapshot) {
            if (dataRadiantEntity == null || dataDireEntity == null) {
                return;
            }

            int radiantGold = 0;
            int direGold = 0;
            int radiantXp = 0;
            int direXp = 0;
            int radiantNetWorthTotal = 0;
            int direNetWorthTotal = 0;
            List<Integer> radiantGoldBySlot = new ArrayList<>(TEAM_SLOT_COUNT);
            List<Integer> direGoldBySlot = new ArrayList<>(TEAM_SLOT_COUNT);
            List<Integer> radiantXpBySlot = new ArrayList<>(TEAM_SLOT_COUNT);
            List<Integer> direXpBySlot = new ArrayList<>(TEAM_SLOT_COUNT);
            List<Integer> radiantNetWorth = new ArrayList<>(TEAM_SLOT_COUNT);
            List<Integer> direNetWorth = new ArrayList<>(TEAM_SLOT_COUNT);

            for (int i = 0; i < TEAM_SLOT_COUNT; i++) {
                String slot = String.format("%04d", i);

                Object rGold = getTeamDataProperty(dataRadiantEntity, slot, "m_iTotalEarnedGold");
                Object rXp = getTeamDataProperty(dataRadiantEntity, slot, "m_iTotalEarnedXP");
                Object dGold = getTeamDataProperty(dataDireEntity, slot, "m_iTotalEarnedGold");
                Object dXp = getTeamDataProperty(dataDireEntity, slot, "m_iTotalEarnedXP");
                Object rNetWorth = getTeamDataProperty(dataRadiantEntity, slot, "m_iNetWorth");
                Object dNetWorth = getTeamDataProperty(dataDireEntity, slot, "m_iNetWorth");

                int rGoldValue = toIntOrZero(rGold);
                int rXpValue = toIntOrZero(rXp);
                int dGoldValue = toIntOrZero(dGold);
                int dXpValue = toIntOrZero(dXp);
                int rNetWorthValue = toIntOrZero(rNetWorth);
                int dNetWorthValue = toIntOrZero(dNetWorth);

                radiantGold += rGoldValue;
                radiantXp += rXpValue;
                direGold += dGoldValue;
                direXp += dXpValue;
                radiantNetWorthTotal += rNetWorthValue;
                direNetWorthTotal += dNetWorthValue;
                radiantGoldBySlot.add(rGoldValue);
                direGoldBySlot.add(dGoldValue);
                radiantXpBySlot.add(rXpValue);
                direXpBySlot.add(dXpValue);
                radiantNetWorth.add(rNetWorthValue);
                direNetWorth.add(dNetWorthValue);
            }

            if (radiantGold == 0 && direGold == 0 && radiantXp == 0 && direXp == 0
                    && radiantNetWorthTotal == 0 && direNetWorthTotal == 0) {
                return;
            }

            Map<String, Object> sample = new HashMap<>();
            sample.put("tick", tick);
            sample.put("game_time", gameClock);
            sample.put("radiant_gold", radiantGold);
            sample.put("dire_gold", direGold);
            sample.put("radiant_xp", radiantXp);
            sample.put("dire_xp", direXp);
            sample.put("radiant_gold_by_player", radiantGoldBySlot);
            sample.put("dire_gold_by_player", direGoldBySlot);
            sample.put("radiant_xp_by_player", radiantXpBySlot);
            sample.put("dire_xp_by_player", direXpBySlot);
            sample.put("gold_advantage", radiantGold - direGold);
            sample.put("xp_advantage", radiantXp - direXp);
            sample.put("radiant_net_worth", radiantNetWorth);
            sample.put("dire_net_worth", direNetWorth);
            sample.put("radiant_net_worth_total", radiantNetWorthTotal);
            sample.put("dire_net_worth_total", direNetWorthTotal);
            sample.put("net_worth_advantage", radiantNetWorthTotal - direNetWorthTotal);
            economySamples.add(sample);
            snapshotTimingState(sample, gameRulesTimeSnapshot, totalPausedSecondsSnapshot, gamePausedSnapshot);
        }

        private Object getTeamDataProperty(Entity teamEntity, String slot, String statName) {
            if (teamEntity == null) {
                return null;
            }

            String[] patterns = new String[] {
                    "m_vecDataTeam.%s.%s",
                    "m_pPlayerData.m_vecDataTeam.%s.%s",
                    "m_vecDataTeam.%d.%s",
                    "m_pPlayerData.m_vecDataTeam.%d.%s"
            };

            for (String pattern : patterns) {
                String property;
                if (pattern.contains("%d")) {
                    int slotIndex = Integer.parseInt(slot);
                    property = String.format(pattern, slotIndex, statName);
                } else {
                    property = String.format(pattern, slot, statName);
                }

                Object value = getPropertySafe(teamEntity, property);
                if (value != null) {
                    return value;
                }
            }

            return null;
        }

        private int toIntOrZero(Object value) {
            if (value instanceof Number) {
                return ((Number) value).intValue();
            }
            return 0;
        }

        private List<String> extractHeroItems(Entity hero) {
            List<String> itemSlotProperties = getHeroItemSlotProperties(hero);
            if (itemSlotProperties.isEmpty()) {
                return Collections.emptyList();
            }

            List<String> items = new ArrayList<>();
            for (String slotProperty : itemSlotProperties) {
                int rawReference = toIntOrZero(getPropertySafe(hero, slotProperty));
                if (rawReference <= 0 || rawReference == INVALID_ENTITY_REFERENCE) {
                    items.add(null);
                    continue;
                }

                Entity itemEntity = resolveEntityReference(rawReference);
                if (itemEntity == null || itemEntity.getDtClass() == null) {
                    items.add(null);
                    continue;
                }

                String itemClass = itemEntity.getDtClass().getDtName();
                String itemName = normalizeDotaEntityName(itemClass);
                if (itemName != null && !itemName.isEmpty()) {
                    items.add(itemName);
                } else {
                    items.add(null);
                }
            }

            int lastPopulatedSlot = items.size() - 1;
            while (lastPopulatedSlot >= 0 && items.get(lastPopulatedSlot) == null) {
                lastPopulatedSlot--;
            }
            if (lastPopulatedSlot < 0) {
                return Collections.emptyList();
            }

            return new ArrayList<>(items.subList(0, lastPopulatedSlot + 1));
        }

        private List<String> getHeroItemSlotProperties(Entity hero) {
            if (hero == null || hero.getDtClass() == null) {
                return Collections.emptyList();
            }

            String dtName = hero.getDtClass().getDtName();
            if (heroItemSlotProperties.containsKey(dtName)) {
                return heroItemSlotProperties.get(dtName);
            }

            List<String> discovered = discoverHeroItemSlotProperties(hero);
            heroItemSlotProperties.put(dtName, discovered);
            return discovered;
        }

        private List<String> discoverHeroItemSlotProperties(Entity hero) {
            Map<Integer, String> propertyNamesBySlot = new LinkedHashMap<>();
            String[] guessedPatterns = new String[] {
                    "m_hItems.%04d",
                    "m_hItems.%d",
                    "m_hItems[%d]",
                    "m_pInventory.m_hItems.%04d",
                    "m_pInventory.m_hItems.%d",
                    "m_pInventory.m_hItems[%d]",
                    "m_Inventory.m_hItems.%04d",
                    "m_Inventory.m_hItems.%d",
                    "m_Inventory.m_hItems[%d]"
            };

            for (int i = 0; i < HERO_ITEM_SLOT_PROBE_COUNT; i++) {
                for (String pattern : guessedPatterns) {
                    String candidate = String.format(pattern, i);
                    if (hero.hasProperty(candidate)) {
                        propertyNamesBySlot.putIfAbsent(i, candidate);
                    }
                }
            }

            if (propertyNamesBySlot.isEmpty() && hero.getState() != null) {
                for (FieldPath fieldPath : hero.getDtClass().collectFieldPaths(hero.getState())) {
                    String propertyName = hero.getDtClass().getNameForFieldPath(fieldPath);
                    if (isLikelyItemSlotProperty(propertyName)) {
                        int slot = extractTrailingIndex(propertyName);
                        propertyNamesBySlot.putIfAbsent(slot, propertyName);
                    }
                }
            }

            List<Integer> sortedSlots = new ArrayList<>(propertyNamesBySlot.keySet());
            Collections.sort(sortedSlots);
            List<String> sorted = new ArrayList<>(sortedSlots.size());
            for (Integer slot : sortedSlots) {
                sorted.add(propertyNamesBySlot.get(slot));
            }
            return sorted;
        }

        private boolean isLikelyItemSlotProperty(String propertyName) {
            if (propertyName == null || !propertyName.contains("m_hItems")) {
                return false;
            }
            int slot = extractTrailingIndex(propertyName);
            return slot >= 0 && slot < HERO_ITEM_SLOT_PROBE_COUNT;
        }

        private int extractTrailingIndex(String propertyName) {
            if (propertyName == null || propertyName.isEmpty()) {
                return -1;
            }

            int end = propertyName.length() - 1;
            while (end >= 0 && !Character.isDigit(propertyName.charAt(end))) {
                if (propertyName.charAt(end) == ']') {
                    end--;
                    continue;
                }
                return -1;
            }
            if (end < 0) {
                return -1;
            }

            int start = end;
            while (start >= 0 && Character.isDigit(propertyName.charAt(start))) {
                start--;
            }

            try {
                return Integer.parseInt(propertyName.substring(start + 1, end + 1));
            } catch (NumberFormatException ex) {
                return -1;
            }
        }

        private Entity resolveEntityReference(int rawReference) {
            Entity resolved = entities.getByHandle(rawReference);
            if (resolved != null) {
                return resolved;
            }

            return entities.getByIndex(rawReference);
        }

        private String normalizeDotaEntityName(String dtName) {
            if (dtName == null || dtName.isEmpty()) {
                return null;
            }

            String normalized = dtName;
            if (normalized.startsWith("CDOTA_Item_")) {
                normalized = normalized.substring("CDOTA_Item_".length());
            } else if (normalized.startsWith("CDOTA_Ability_")) {
                normalized = normalized.substring("CDOTA_Ability_".length());
            } else {
                return dtName;
            }

            StringBuilder builder = new StringBuilder();
            for (int i = 0; i < normalized.length(); i++) {
                char current = normalized.charAt(i);
                if (current == '-' || current == ' ') {
                    if (builder.length() > 0 && builder.charAt(builder.length() - 1) != '_') {
                        builder.append('_');
                    }
                    continue;
                }
                if (Character.isUpperCase(current) && builder.length() > 0) {
                    char previous = normalized.charAt(i - 1);
                    boolean nextIsLower = (i + 1) < normalized.length()
                            && Character.isLowerCase(normalized.charAt(i + 1));
                    if (Character.isLowerCase(previous) || Character.isDigit(previous) || nextIsLower) {
                        if (builder.charAt(builder.length() - 1) != '_') {
                            builder.append('_');
                        }
                    }
                }
                if (current == '_') {
                    if (builder.length() > 0 && builder.charAt(builder.length() - 1) != '_') {
                        builder.append(current);
                    }
                } else {
                    builder.append(Character.toLowerCase(current));
                }
            }

            return builder.toString();
        }

        private float[] getEntityPosition(Entity e) {
            try {
                // Try CBodyComponent first (Source 2)
                Object cellX = getPropertySafe(e, "CBodyComponent.m_cellX");
                Object cellY = getPropertySafe(e, "CBodyComponent.m_cellY");
                Object vecX = getPropertySafe(e, "CBodyComponent.m_vecX");
                Object vecY = getPropertySafe(e, "CBodyComponent.m_vecY");
                
                if (cellX != null && cellY != null) {
                    int cx = ((Number) cellX).intValue();
                    int cy = ((Number) cellY).intValue();
                    float vx = vecX != null ? ((Number) vecX).floatValue() : 0;
                    float vy = vecY != null ? ((Number) vecY).floatValue() : 0;
                    
                    // Convert cell coordinates to world coordinates
                    // Cell size is typically 128 units
                    float worldX = cx * 128.0f + vx;
                    float worldY = cy * 128.0f + vy;
                    
                    return new float[] { worldX, worldY };
                }
                
                // Fallback to m_vecOrigin
                Object origin = getPropertySafe(e, "m_vecOrigin");
                if (origin != null && origin instanceof float[]) {
                    float[] vec = (float[]) origin;
                    return new float[] { vec[0], vec[1] };
                }
                
            } catch (Exception ex) {
                // Position extraction failed
            }
            return null;
        }
        
        private Object getPropertySafe(Entity e, String property) {
            try {
                if (e.hasProperty(property)) {
                    return e.getProperty(property);
                }
            } catch (Exception ex) {
                // Ignore property access errors
            }
            return null;
        }

        private float getReplayTime(int tick, Float gameRulesTimeSnapshot) {
            if (gameRulesTimeSnapshot != null) {
                return gameRulesTimeSnapshot;
            }

            float tickSeconds = tick / 30.0f;
            return tickSeconds;
        }

        private float getCurrentGameClock(
                int tick,
                Float gameRulesTimeSnapshot,
                float totalPausedSecondsSnapshot,
                boolean gamePausedSnapshot) {
            float replayTime = getReplayTime(tick, gameRulesTimeSnapshot);
            if (hasClockZeroTime) {
                float postGamePausedSeconds = getPausedDurationAtReplayTime(replayTime);
                if (gamePausedSnapshot && pauseIntervalActive && replayTime > pauseIntervalStartReplayTime) {
                    postGamePausedSeconds += replayTime - pauseIntervalStartReplayTime;
                }

                if (postGamePausedSeconds <= 0.0f) {
                    float fallbackPostGamePausedSeconds = hasPausedSecondsAtClockZero
                            ? Math.max(0.0f, totalPausedSecondsSnapshot - pausedSecondsAtClockZero)
                            : Math.max(0.0f, totalPausedSecondsSnapshot);
                    postGamePausedSeconds = fallbackPostGamePausedSeconds;
                }
                return replayTime - clockZeroTime - postGamePausedSeconds;
            }
            return replayTime;
        }

        private void snapshotTimingState(
                Map<String, Object> sample,
                Float gameRulesTimeSnapshot,
                float totalPausedSecondsSnapshot,
                boolean gamePausedSnapshot) {
            if (gameRulesTimeSnapshot != null) {
                gameRulesTimeSnapshots.put(sample, gameRulesTimeSnapshot);
            }
            totalPausedSecondsSnapshots.put(sample, totalPausedSecondsSnapshot);
            gamePausedSnapshots.put(sample, gamePausedSnapshot);
        }

        private void recalculateGameTimes(List<Map<String, Object>> samples) {
            for (Map<String, Object> sample : samples) {
                Object tickObj = sample.get("tick");
                if (!(tickObj instanceof Number)) {
                    continue;
                }
                int tick = ((Number) tickObj).intValue();
                Float gameRulesTimeSnapshot = gameRulesTimeSnapshots.get(sample);
                Float totalPausedSecondsSnapshot = totalPausedSecondsSnapshots.get(sample);
                Boolean gamePausedSnapshot = gamePausedSnapshots.get(sample);
                float pausedSeconds = totalPausedSecondsSnapshot != null ? totalPausedSecondsSnapshot : currentTotalPausedSeconds;
                boolean pausedFlag = gamePausedSnapshot != null ? gamePausedSnapshot : false;
                sample.put("game_time", getCurrentGameClock(tick, gameRulesTimeSnapshot, pausedSeconds, pausedFlag));
            }
        }

        private float getPausedDurationAtReplayTime(float replayTime) {
            float paused = 0.0f;
            for (Map<String, Object> interval : pauseIntervals) {
                Object startObj = interval.get("replay_start_time");
                Object endObj = interval.get("replay_end_time");
                if (!(startObj instanceof Number) || !(endObj instanceof Number)) {
                    continue;
                }
                float start = ((Number) startObj).floatValue();
                float end = ((Number) endObj).floatValue();
                if (replayTime <= start) {
                    continue;
                }
                if (replayTime >= end) {
                    paused += end - start;
                } else {
                    paused += replayTime - start;
                }
            }
            return paused;
        }

        private void updatePauseIntervals(
                float replayTime,
                float gameClock,
                boolean isGamePaused,
                float totalPausedSeconds) {
            if (!hasClockZeroTime || replayTime < clockZeroTime) {
                if (pauseIntervalActive) {
                    pauseIntervalActive = false;
                }
                previousTotalPausedSeconds = totalPausedSeconds;
                return;
            }

            if (!isGamePaused && !pauseIntervalActive && previousTotalPausedSeconds != null) {
                float deltaPaused = totalPausedSeconds - previousTotalPausedSeconds;
                if (deltaPaused > 0.25f) {
                    float replayStart = replayTime - deltaPaused;
                    if (replayStart < clockZeroTime) {
                        replayStart = clockZeroTime;
                    }
                    float duration = replayTime - replayStart;
                    if (duration > 1e-3f) {
                        Map<String, Object> interval = new HashMap<>();
                        interval.put("replay_start_time", replayStart);
                        interval.put("replay_end_time", replayTime);
                        interval.put("duration_seconds", duration);
                        interval.put("game_time", gameClock);
                        pauseIntervals.add(interval);
                    }
                }
            }

            if (isGamePaused && !pauseIntervalActive) {
                pauseIntervalActive = true;
                pauseIntervalStartReplayTime = replayTime;
                pauseIntervalStartGameTime = gameClock;
                previousTotalPausedSeconds = totalPausedSeconds;
                return;
            }

            if (!isGamePaused && pauseIntervalActive) {
                closePauseInterval(replayTime);
            }
            previousTotalPausedSeconds = totalPausedSeconds;
        }

        private void closePauseInterval(float replayEndTime) {
            float duration = replayEndTime - pauseIntervalStartReplayTime;
            if (duration <= 1e-3f) {
                pauseIntervalActive = false;
                return;
            }

            Map<String, Object> interval = new HashMap<>();
            interval.put("replay_start_time", pauseIntervalStartReplayTime);
            interval.put("replay_end_time", replayEndTime);
            interval.put("duration_seconds", duration);
            interval.put("game_time", pauseIntervalStartGameTime);
            pauseIntervals.add(interval);
            pauseIntervalActive = false;
        }

        private void finalizePauseIntervals() {
            if (pauseIntervalActive) {
                closePauseInterval(lastObservedReplayTime);
            }
        }

        private boolean isPastFinalReplayTime(float replayTime) {
            return hasFinalReplayTime && replayTime > finalReplayTime + FINAL_WHISTLE_EPSILON_SECONDS;
        }

        private float resolveSampleReplayTime(Map<String, Object> sample) {
            Object tickObj = sample.get("tick");
            int tick = tickObj instanceof Number ? ((Number) tickObj).intValue() : 0;
            Float gameRulesTimeSnapshot = gameRulesTimeSnapshots.get(sample);
            return getReplayTime(tick, gameRulesTimeSnapshot);
        }

        private void trimTimedSamples(List<Map<String, Object>> samples) {
            if (!hasFinalReplayTime) {
                return;
            }
            samples.removeIf(sample -> isPastFinalReplayTime(resolveSampleReplayTime(sample)));
        }

        private void trimKillEvents() {
            if (!hasFinalReplayTime) {
                return;
            }
            killEvents.removeIf(event -> {
                Object replayTimeObj = event.get("time");
                if (!(replayTimeObj instanceof Number)) {
                    return false;
                }
                return isPastFinalReplayTime(((Number) replayTimeObj).floatValue());
            });
        }

        private void trimPauseIntervals() {
            if (!hasFinalReplayTime) {
                return;
            }

            List<Map<String, Object>> trimmedIntervals = new ArrayList<>();
            for (Map<String, Object> interval : pauseIntervals) {
                Object startObj = interval.get("replay_start_time");
                Object endObj = interval.get("replay_end_time");
                if (!(startObj instanceof Number) || !(endObj instanceof Number)) {
                    trimmedIntervals.add(interval);
                    continue;
                }

                float start = ((Number) startObj).floatValue();
                float end = ((Number) endObj).floatValue();
                if (start >= finalReplayTime - FINAL_WHISTLE_EPSILON_SECONDS) {
                    continue;
                }
                if (end > finalReplayTime) {
                    end = finalReplayTime;
                }
                if (end - start <= FINAL_WHISTLE_EPSILON_SECONDS) {
                    continue;
                }

                interval.put("replay_end_time", end);
                interval.put("duration_seconds", end - start);
                trimmedIntervals.add(interval);
            }
            pauseIntervals = trimmedIntervals;
        }

        private void trimPostGameSamples() {
            if (postGameSamplesTrimmed || !hasFinalReplayTime) {
                return;
            }

            trimTimedSamples(positionSamples);
            trimTimedSamples(wardEvents);
            trimTimedSamples(economySamples);
            trimKillEvents();
            trimPauseIntervals();
            postGameSamplesTrimmed = true;
        }
        
        // Getters
        public int getTotalTicks() { return totalTicks; }
        public long getMatchId() { return matchId; }
        public float getGameTime() { return gameTime; }
        public float getClockZeroTime() { return clockZeroTime; }
        public boolean hasClockZeroTime() { return hasClockZeroTime; }
        public String getClockZeroSource() { return clockZeroSource; }
        public float getPreGameStartTime() { return preGameStartTime; }
        public boolean hasPreGameStartTime() { return hasPreGameStartTime; }
        public float getRawGameStartTime() { return rawGameStartTime; }
        public boolean hasRawGameStartTime() { return hasRawGameStartTime; }
        public float getCombatLogGameStartTime() { return combatLogGameStartTime; }
        public boolean hasCombatLogGameStartTime() { return hasCombatLogGameStartTime; }
        public float getPausedSecondsAtClockZero() { return pausedSecondsAtClockZero; }
        public boolean hasPausedSecondsAtClockZero() { return hasPausedSecondsAtClockZero; }
        public int getWinner() { return winner; }
        public float getFinalGameTime() { return finalGameTime; }
        public boolean hasFinalGameTime() { return hasFinalGameTime; }
        public float getFinalReplayTime() { return finalReplayTime; }
        public boolean hasFinalReplayTime() { return hasFinalReplayTime; }
        public String getFinalGameTimeSource() { return finalGameTimeSource; }
        public List<Map<String, Object>> getPauseIntervals() {
            finalizePauseIntervals();
            trimPostGameSamples();
            return pauseIntervals;
        }
        public List<Map<String, Object>> getPositionSamples() {
            trimPostGameSamples();
            return positionSamples;
        }
        public List<Map<String, Object>> getKillEvents() {
            trimPostGameSamples();
            return killEvents;
        }
        public List<Map<String, Object>> getWardEvents() {
            trimPostGameSamples();
            return wardEvents;
        }
        public List<Map<String, Object>> getEconomySamples() {
            trimPostGameSamples();
            return economySamples;
        }
        public Map<Integer, String> getHeroMapping() { return heroMapping; }
    }
    
    /**
     * Internal class to track hero state
     */
    private static class HeroState {
        String heroName;
        int team;
        int handle;
    }
}
