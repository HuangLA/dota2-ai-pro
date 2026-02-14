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
        metadata.put("ticks_per_second", 30);
        metadata.put("time_mapping", "game_time = m_fGameTime - clock_zero_time; clock_zero_time priority: m_flGameStartTime - pregame_paused_seconds, then combatlog GAME_STATE=5, then (m_flPreGameStartTime + 90), then m_flGameStartTime; fallback to tick / 30.0 - clock_zero_time");
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
        if (processor.getGameTime() > 0) {
            metadata.put("duration_seconds", processor.getGameTime());
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
        
        result.put("metadata", metadata);
        
        // Add position samples (hero coordinates over time)
        result.put("positions", processor.getPositionSamples());
        
        // Add kill events
        result.put("kills", processor.getKillEvents());
        
        // Add ward events
        result.put("wards", processor.getWardEvents());
        
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
        
        // Collected data
        private List<Map<String, Object>> positionSamples = new ArrayList<>();
        private List<Map<String, Object>> killEvents = new ArrayList<>();
        private List<Map<String, Object>> wardEvents = new ArrayList<>();
        private Map<Integer, String> heroMapping = new HashMap<>();
        
        // Track known heroes by entity handle
        private Map<Integer, HeroState> trackedHeroes = new HashMap<>();
        
        // Track which hero+team combinations we've already seen (to filter illusions)
        // Key: "HeroName_Team" (e.g., "Spectre_3"), Value: first entity handle
        private Map<String, Integer> firstHeroHandle = new HashMap<>();

        // Keep per-sample gamerules clock snapshots so we can recompute
        // all game_time values against one consistent basis later.
        private IdentityHashMap<Map<String, Object>, Float> gameRulesTimeSnapshots = new IdentityHashMap<>();
        
        public DotaMatchProcessor(boolean minimalMode) {
            this.minimalMode = minimalMode;
        }
        
        @OnTickStart
        public void onTickStart(Context ctx, boolean synthetic) {
            totalTicks++;
            
            // Sample hero positions at regular intervals
            if (!minimalMode && (totalTicks - lastSampledTick) >= POSITION_SAMPLE_INTERVAL) {
                lastSampledTick = totalTicks;
                sampleHeroPositions(ctx);
            }
        }
        
        @OnEntityCreated(classPattern = "CDOTAGamerulesProxy")
        public void onGameRulesCreated(Context ctx, Entity e) {
            updateGameRules(e);
        }
        
        @OnEntityUpdated(classPattern = "CDOTAGamerulesProxy")
        public void onGameRulesUpdated(Context ctx, Entity e, FieldPath[] changedPaths, int numChanges) {
            updateGameRules(e);
        }
        
        private void updateGameRules(Entity e) {
            try {
                // Try to get game time
                Object gameTimeObj = getPropertySafe(e, "m_pGameRules.m_fGameTime");
                if (gameTimeObj != null) {
                    currentGameRulesTime = ((Number) gameTimeObj).floatValue();
                    gameTime = hasClockZeroTime
                            ? currentGameRulesTime - clockZeroTime
                            : currentGameRulesTime;
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
                float totalPausedSeconds = 0.0f;
                if (totalPausedTicksObj != null) {
                    totalPausedSeconds = ((Number) totalPausedTicksObj).floatValue() / 30.0f;
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
                    }
                }
                
                // Try to get match ID
                Object matchIdObj = getPropertySafe(e, "m_pGameRules.m_unMatchID64");
                if (matchIdObj != null) {
                    matchId = ((Number) matchIdObj).longValue();
                }
                
                // Try to get winner
                Object winnerObj = getPropertySafe(e, "m_pGameRules.m_nGameWinner");
                if (winnerObj != null) {
                    winner = ((Number) winnerObj).intValue();
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
            wardEvent.put("game_time", getCurrentGameClock(ctx.getTick(), currentGameRulesTime));
            wardEvent.put("handle", ward.getHandle());
            snapshotGameRulesTime(wardEvent, currentGameRulesTime);
            
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
            wardEvent.put("game_time", getCurrentGameClock(ctx.getTick(), currentGameRulesTime));
            wardEvent.put("handle", ward.getHandle());
            snapshotGameRulesTime(wardEvent, currentGameRulesTime);
            
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
                    }
                }
            } catch (Exception e) {
                // Combat log entry access can fail, ignore
            }
        }
        
        private void sampleHeroPositions(Context ctx) {
            int tick = ctx.getTick();
            Float gameRulesTimeSnapshot = currentGameRulesTime;
            float gameClock = getCurrentGameClock(tick, gameRulesTimeSnapshot);
            
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
                    
                    positionSamples.add(sample);
                    snapshotGameRulesTime(sample, gameRulesTimeSnapshot);
                    
                } catch (Exception e) {
                    // Entity access can fail, skip this sample
                }
            }
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

        private float getCurrentGameClock(int tick, Float gameRulesTimeSnapshot) {
            if (gameRulesTimeSnapshot != null) {
                return hasClockZeroTime
                        ? gameRulesTimeSnapshot - clockZeroTime
                        : gameRulesTimeSnapshot;
            }

            float tickSeconds = tick / 30.0f;
            if (hasClockZeroTime) {
                return tickSeconds - clockZeroTime;
            }
            return tickSeconds;
        }

        private void snapshotGameRulesTime(Map<String, Object> sample, Float gameRulesTimeSnapshot) {
            if (gameRulesTimeSnapshot != null) {
                gameRulesTimeSnapshots.put(sample, gameRulesTimeSnapshot);
            }
        }

        private void recalculateGameTimes(List<Map<String, Object>> samples) {
            for (Map<String, Object> sample : samples) {
                Object tickObj = sample.get("tick");
                if (!(tickObj instanceof Number)) {
                    continue;
                }
                int tick = ((Number) tickObj).intValue();
                Float gameRulesTimeSnapshot = gameRulesTimeSnapshots.get(sample);
                sample.put("game_time", getCurrentGameClock(tick, gameRulesTimeSnapshot));
            }
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
        public List<Map<String, Object>> getPositionSamples() { return positionSamples; }
        public List<Map<String, Object>> getKillEvents() { return killEvents; }
        public List<Map<String, Object>> getWardEvents() { return wardEvents; }
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
