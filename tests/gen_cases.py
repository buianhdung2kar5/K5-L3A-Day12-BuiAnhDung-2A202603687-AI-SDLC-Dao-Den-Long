import json, os
Q = {"random_motes": False, "random_shades": False, "random_drifters": False, "wind_enabled": False, "motes": []}
def sc(**kw):
    d = dict(Q); d.update(kw); return d
def ev(tick, name, data=None):
    return {"tick": tick, "name": name, "data": data or {}}
cases = []
def case(name, covers, why, args, scenario=None, inputs=None, expect=None, snap=None, **extra):
    c = {"name": name, "covers": covers, "why": why, "args": args}
    if snap: c["snapshot_every"] = snap
    if scenario is not None: c["scenario"] = scenario
    if inputs is not None: c["inputs"] = inputs
    if expect is not None: c["expect"] = expect
    c.update(extra); cases.append(c)
def A(ticks, seed=1, night=1): return {"seed": seed, "ticks": ticks, "night": night}
def end(ticks, state="playing", score=0): return {"ticks": ticks, "state": state, "score": score}
def snapm(tick, match): return {"tick": tick, "match": match}
def fr(*frames): return {"frames": list(frames)}

# ---------------- fireflies
case("pickup_mote", ["S4"], "Mote 0.5 m away is picked on tick 1; pickup gives no points now (+10 is per mote deposited).", A(3),
     sc(motes=[[0.5, 0]]), expect={"events": [ev(1, "mote_picked", {"carried": 1})], "end": end(3, "playing", 0)})
case("pickup_height_tolerance", ["S4"], "XZ in range: mote 1.4 m above the feet is picked (<= 1.5), mote 1.6 m above is not.", A(3),
     sc(motes=[[0.5, 1.4, 0], [0.5, 1.6, 0]]), snap=3,
     expect={"events": [ev(1, "mote_picked", {"carried": 1})], "end": end(3), "snapshots": [snapm(3, {"motes_active": 1})]})
case("pickup_xz_radius", ["S4"], "A mote exactly 1.0 m away is picked (<= 1.0); 1.01 m is not.", A(3),
     sc(motes=[[1.0, 0], [1.01, 0]]), snap=3,
     expect={"events": [ev(1, "mote_picked", {"carried": 1})], "end": end(3), "snapshots": [snapm(3, {"motes_active": 1})]})
case("pickup_capacity_10", ["S4"], "carried = capacity (10): a mote in range is ignored.", A(3),
     sc(player={"carried": 10}, motes=[[0.5, 0]]), snap=3,
     expect={"events": [], "end": end(3), "snapshots": [snapm(3, {"motes_active": 1, "player": {"carried": 10}})]})
case("mote_initial_20_distinct", ["S4", "S1"], "Night 1 starts with 20 random fireflies on 20 different points.", A(0),
     {"random_shades": False, "random_drifters": False, "wind_enabled": False}, snap=10,
     expect={"events": [], "end": end(0), "snapshots": [snapm(0, {"motes_active": 20})],
             "checks": [{"type": "motes_distinct", "tick": 0, "count": 20}]})
case("mote_spawn_schedule", ["S4"], "One firefly is added at ticks 240, 480 (20 -> 21 -> 22).", A(480),
     {"random_shades": False, "random_drifters": False, "wind_enabled": False}, snap=120,
     expect={"events": [], "end": end(480), "snapshots": [snapm(120, {"motes_active": 20}), snapm(240, {"motes_active": 21}), snapm(360, {"motes_active": 21}), snapm(480, {"motes_active": 22})]})
case("mote_cap_30", ["S4"], "With 30 fireflies on the ground no more are spawned at tick 240/480.", A(480),
     {"random_shades": False, "random_drifters": False, "wind_enabled": False, "motes": [[30, -7 + 0.5 * i] for i in range(30)]}, snap=240,
     expect={"events": [], "end": end(480), "snapshots": [snapm(240, {"motes_active": 30}), snapm(480, {"motes_active": 30})]})
case("dropped_mote_ttl", ["S9"], "A dropped mote with ttl 3 ticks exists at tick 3 and is gone at tick 4.", A(4),
     sc(motes=[{"pos": [10, 0], "kind": "dropped", "ttl_s": 0.05}]), snap=1,
     expect={"events": [], "end": end(4), "snapshots": [snapm(3, {"motes_active": 1}), snapm(4, {"motes_active": 0})]})

# ---------------- lanterns, scoring
case("deposit_and_light", ["S5"], "Carrying 10 = lantern_cost next to L1 (0,0,25): interact on tick 2 deposits 10 and lights it. Score 10*5 + 100 = 150; capacity grows to 12.", A(5),
     sc(player={"pos": [0, 24], "carried": 10}), fr({"tick": 2, "interact": True}, {"tick": 3, "interact": False}), snap=5,
     expect={"events": [ev(3, "deposit", {"lantern_id": "L1", "amount": 10, "deposited": 10}), ev(3, "lantern_lit", {"lantern_id": "L1"})], "end": end(5, "playing", 150), "snapshots": [snapm(5, {"player": {"capacity": 12}})]})
case("deposit_remembers_progress", ["S5"], "Deposit 3, walk and pick 7 more (tick 18), deposit 7: lantern remembers progress (3+7=10) and lights. Score 30/2... = 5*10 + 100 = 150.", A(22),
     sc(player={"pos": [0, 24], "carried": 3}, motes=[[0, 26.5]] * 7),
     fr({"tick": 0, "move": [0, 1], "interact": True}, {"tick": 1, "interact": False}, {"tick": 20, "interact": True}, {"tick": 21, "interact": False}),
     expect={"events": [ev(1, "deposit", {"lantern_id": "L1", "amount": 3, "deposited": 3})] + [ev(18, "mote_picked", {"carried": i}) for i in range(1, 8)] +
      [ev(21, "deposit", {"lantern_id": "L1", "amount": 7, "deposited": 10}), ev(21, "lantern_lit", {"lantern_id": "L1"})], "end": end(22, "playing", 150)})
case("deposit_out_of_range", ["S5"], "5 m from L1 (> 2.0): interact does nothing.", A(3),
     sc(player={"pos": [0, 20], "carried": 10}), fr({"tick": 0, "interact": True}),
     expect={"events": [], "end": end(3)})
case("deposit_tie_smaller_id", ["S5"], "L1 and L2 equally near (1.5 m): the smaller id (L1) gets the deposit.", A(3),
     sc(player={"carried": 10}, lanterns=[{"id": "L1", "pos": [1.5, 0]}, {"id": "L2", "pos": [-1.5, 0]}]), fr({"tick": 0, "interact": True}),
     expect={"events": [ev(1, "deposit", {"lantern_id": "L1", "amount": 10, "deposited": 10}), ev(1, "lantern_lit", {"lantern_id": "L1"})], "end": end(3, "playing", 150)})
case("deposit_nearest", ["S5"], "L3 is nearest (1.0 m) among three lanterns in range: it gets the deposit.", A(3),
     sc(player={"carried": 10}, lanterns=[{"id": "L1", "pos": [1.5, 0]}, {"id": "L2", "pos": [-1.5, 0]}, {"id": "L3", "pos": [0, 1.0]}]), fr({"tick": 0, "interact": True}),
     expect={"events": [ev(1, "deposit", {"lantern_id": "L3", "amount": 10, "deposited": 10}), ev(1, "lantern_lit", {"lantern_id": "L3"})], "end": end(3, "playing", 150)})
# ---------------- win / lose
lit4 = [{"id": i, "lit": True} for i in ["L2", "L3", "L4", "L5"]]
case("dawn_loss", ["S10"], "time_left_s 0.05 = 3 ticks, nothing lit: lost / dawn at tick 3.", A(10), sc(time_left_s=0.05),
     expect={"events": [ev(3, "game_over", {"result": "lost", "reason": "dawn"})], "end": end(3, "lost", 0)})
case("no_flames_beats_dawn", ["S10", "S9"], "Last flame lost on the very tick time runs out: reason is no_flames, not dawn.", A(10),
     sc(time_left_s=1 / 60, player={"flames": 1}, shades=[{"id": "A", "pos": [0.5, 0.5, 0]}]),
     expect={"events": [ev(1, "player_hit", {"by": "shade", "flames": 0, "dropped": 0}), ev(1, "game_over", {"result": "lost", "reason": "no_flames"})], "end": end(1, "lost", 0)})

# ---------------- shades: hit, recoil, invulnerability
case("shade_hits_until_lost", ["S9", "S10"],
     "Shade 0.5 m away, carry 4. Hit tick 1: flames 2, drop floor(4/2)=2 (ring 1.5-2.5, ttl 480). Invuln 90 ticks, shade recoils 2 m (state recoil) then chases back: hit tick 91 (carry 2, drop 1), tick 181 (carry 1, drop 0) -> no_flames.",
     A(300), sc(player={"carried": 4}, shades=[{"id": "A", "pos": [0.5, 0.5, 0]}]), snap=31,
     expect={"events": [ev(1, "player_hit", {"by": "shade", "flames": 2, "dropped": 2}), ev(91, "player_hit", {"by": "shade", "flames": 1, "dropped": 1}),
                        ev(181, "player_hit", {"by": "shade", "flames": 0, "dropped": 0}), ev(181, "game_over", {"result": "lost", "reason": "no_flames"})],
             "end": end(181, "lost", 0),
             "snapshots": [snapm(31, {"motes_active": 2, "player": {"flames": 2, "carried": 2, "invuln": True}, "shades": [{"id": "A", "pos": [1.433, 0.5, 0], "state": "recoil"}]})],
             "checks": [{"type": "motes_ring", "tick": 31, "kind": "dropped", "min": 1.5, "max": 2.5, "count": 2}]})
case("invulnerability_from_scenario", ["S9"], "invuln_ticks 100: the adjacent shade cannot hit before tick 100 (counter reaches 0 then).", A(120),
     sc(player={"invuln_ticks": 100}, shades=[{"id": "A", "pos": [0.5, 0.5, 0]}]),
     expect={"events": [ev(100, "player_hit", {"by": "shade", "flames": 2, "dropped": 0})], "end": end(120)})
case("shade_hit_only_once_per_tick", ["S9"], "Two shades touching at once: only one flame is lost that tick.", A(2),
     sc(shades=[{"id": "S1", "pos": [0.5, 0.5, 0]}, {"id": "S2", "pos": [-0.5, 0.5, 0]}]),
     expect={"events": [ev(1, "player_hit", {"by": "shade", "flames": 2, "dropped": 0})], "end": end(2)})
case("shade_states_detect_and_lose", ["S8"], "wander at 11 m -> chase (<=12, moves 4/60 toward Mây: 10.933); wander at 13 m stays wander; chase at 19 m -> wander (>18).", A(1),
     sc(shades=[{"id": "A", "pos": [11, 0.5, 0], "state": "wander"}, {"id": "B", "pos": [13, 0.5, 0], "state": "wander"}, {"id": "C", "pos": [19, 0.5, 0], "state": "chase"}]), snap=1,
     expect={"events": [], "end": end(1), "snapshots": [snapm(1, {"shades": [{"id": "A", "pos": [10.933, 0.5, 0], "state": "chase"}, {"id": "B", "state": "wander"}, {"id": "C", "state": "wander"}]})]})
case("shade_speed_night1", ["S8"], "Night 1 shade speed 4.0 m/s: 10 ticks toward Mây = 0.667 m (10 -> 9.333).", A(10),
     sc(shades=[{"id": "A", "pos": [10, 0.5, 0]}]), snap=10,
     expect={"events": [], "end": end(10), "snapshots": [snapm(10, {"shades": [{"pos": [9.333, 0.5, 0]}]})]})
case("shade_speed_night3", ["S8"], "Night 3 shade speed 4.5 m/s: 10 ticks = 0.75 m (10 -> 9.25).", A(10, 1, 3),
     sc(shades=[{"id": "A", "pos": [10, 0.5, -20]}]), snap=10,
     expect={"events": [], "end": end(10), "snapshots": [snapm(10, {"shades": [{"pos": [9.25, 0.5, -20]}]})]})
base_sched = {"random_motes": False, "motes": [], "random_drifters": False}
case("shade_schedule_night1", ["S8"], "Night 1: 2 shades at tick 300 (state spawning, then wander at tick 330), then 1 every 480 ticks (tick 780).", A(790, 7), base_sched, snap=30,
     expect={"event_names": ["shade_spawned"], "events": [ev(300, "shade_spawned", {"id": "S1"}), ev(300, "shade_spawned", {"id": "S2"}), ev(780, "shade_spawned", {"id": "S3"})], "end": {"ticks": 790},
             "snapshots": [snapm(300, {"shades": [{"id": "S1", "state": "spawning"}, {"id": "S2", "state": "spawning"}]}), snapm(330, {"shades": [{"id": "S1", "state": "wander"}, {"id": "S2", "state": "wander"}]})]})
case("shade_schedule_night2", ["S8"], "Night 2: 2 shades at tick 300, then every 420 ticks (720).", A(730, 7, 2), base_sched,
     expect={"event_names": ["shade_spawned"], "events": [ev(300, "shade_spawned", {"id": "S1"}), ev(300, "shade_spawned", {"id": "S2"}), ev(720, "shade_spawned", {"id": "S3"})], "end": {"ticks": 730}})
case("shade_schedule_night3", ["S8"], "Night 3: 2 shades at tick 300, then every 360 ticks (660).", A(670, 7, 3), dict(base_sched, wind_enabled=False),
     expect={"event_names": ["shade_spawned"], "events": [ev(300, "shade_spawned", {"id": "S1"}), ev(300, "shade_spawned", {"id": "S2"}), ev(660, "shade_spawned", {"id": "S3"})], "end": {"ticks": 670}})
case("shade_cap_night1", ["S8"], "Night 1 max 6 shades: spawns at 300,300,780,1260,1740,2220 and none at 2700.", A(2800, 7), dict(base_sched, player={"flames": 100}),
     expect={"event_names": ["shade_spawned"], "events": [ev(300, "shade_spawned", {"id": "S1"}), ev(300, "shade_spawned", {"id": "S2"}), ev(780, "shade_spawned", {"id": "S3"}), ev(1260, "shade_spawned", {"id": "S4"}), ev(1740, "shade_spawned", {"id": "S5"}), ev(2220, "shade_spawned", {"id": "S6"})], "end": {"ticks": 2800}})
case("shade_spawn_keeps_15m_from_player", ["S8"], "Player standing at (37,0) next to spawn points at 15 deg and -15 deg: spawned shades are >= 15 m from Mây.", A(300, 3), dict(base_sched, player={"pos": [37, 0]}), snap=300,
     expect={"event_names": ["shade_spawned"], "events": [ev(300, "shade_spawned", {"id": "S1"}), ev(300, "shade_spawned", {"id": "S2"})], "end": {"ticks": 300},
             "checks": [{"type": "shade_min_dist", "tick": 300, "min": 15, "count": 2}]})

# ---------------- safe zones
case("safe_zone_blocks_shade", ["S6"], "L1 (0,0,25) lit, Mây standing on it: a shade coming from z=35 is stopped at the 6 m edge: z = 31.", A(100),
     sc(player={"pos": [0, 25]}, lanterns=[{"id": "L1", "lit": True}], shades=[{"id": "A", "pos": [0, 0.5, 35]}]), snap=100,
     expect={"events": [], "end": end(100), "snapshots": [snapm(100, {"shades": [{"id": "A", "pos": [0, 0.5, 31]}]})]})
case("safe_zone_ejects_and_is_harmless", ["S6"], "Lighting L1 while a shade sits 0.5 m from it (and from Mây): no hit for 30+ ticks, shade pushed evenly to the 6 m edge: at tick 29 z = 25 - (0.5 + 5.5*29/30) = 19.183.", A(85),
     sc(player={"pos": [0, 24], "carried": 10}, shades=[{"id": "A", "pos": [0, 0.5, 24.5]}]), fr({"tick": 0, "interact": True}, {"tick": 1, "interact": False}), snap=29,
     expect={"events": [ev(1, "deposit", {"lantern_id": "L1", "amount": 10, "deposited": 10}), ev(1, "lantern_lit", {"lantern_id": "L1"})], "end": end(85, "playing", 150),
             "snapshots": [snapm(29, {"shades": [{"id": "A", "pos": [0, 0.5, 19.183]}]})]})

# ---------------- pulse
case("pulse_3d_range_and_score", ["S7"], "Pulse centre = feet+0.8, 3D radius 5: A (3 m) and E (2.83 m) are stunned, D at XZ=5 is 5.009 m in 3D (out), B (10 m) out. +5 each = 10.", A(3),
     sc(player={"carried": 3}, shades=[{"id": "A", "pos": [3, 0.5, 0]}, {"id": "D", "pos": [5, 0.5, 0]}, {"id": "E", "pos": [-2, 0.5, 2]}, {"id": "B", "pos": [10, 0.5, 0]}]),
     fr({"tick": 0, "pulse": True}), snap=3,
     expect={"events": [ev(1, "pulse", {"stunned_ids": ["A", "E"]})], "end": end(3, "playing", 10),
             "snapshots": [snapm(3, {"player": {"carried": 0}, "shades": [{"id": "A", "state": "stunned"}, {"id": "D", "state": "chase"}, {"id": "E", "state": "stunned"}, {"id": "B", "state": "chase"}]})]})
case("pulse_radius_boundary", ["S7"], "Shade at XZ 4.9 m (3D distance 4.909 from the pulse centre at feet+0.8) is inside the 5 m radius and is stunned.", A(3),
     sc(player={"carried": 3}, shades=[{"id": "A", "pos": [4.9, 0.5, 0]}]), fr({"tick": 0, "pulse": True}), snap=3,
     expect={"events": [ev(1, "pulse", {"stunned_ids": ["A"]})], "end": end(3, "playing", 5), "snapshots": [snapm(3, {"shades": [{"state": "stunned"}]})]})
case("pulse_push_and_stun_timing", ["S7"], "A at 3 m: pushed 4 m in 15 ticks (x=7 at tick 15), still stunned at tick 120, chasing at tick 135 (x = 7 - 15*0.0667 = 6). pulse_cd_s at tick 15 = (180-14)/60 = 2.767.", A(135),
     sc(player={"carried": 3}, shades=[{"id": "A", "pos": [3, 0.5, 0]}]), fr({"tick": 0, "pulse": True}), snap=15,
     expect={"events": [ev(1, "pulse", {"stunned_ids": ["A"]})], "end": end(135, "playing", 5),
             "snapshots": [snapm(15, {"player": {"pulse_cd_s": 2.767}, "shades": [{"pos": [7, 0.5, 0], "state": "stunned"}]}),
                           snapm(120, {"shades": [{"state": "stunned"}]}), snapm(135, {"shades": [{"pos": [6, 0.5, 0], "state": "chase"}]})]})
case("pulse_refreshes_stun", ["S7"], "A already stunned (50 ticks left) is stunned again for 120 ticks, pushed 4 m and scores +5 again: still stunned at tick 100, x=7.", A(100),
     sc(player={"carried": 3}, shades=[{"id": "A", "pos": [3, 0.5, 0], "state": "stunned", "state_ticks_left": 50}]), fr({"tick": 0, "pulse": True}), snap=100,
     expect={"events": [ev(1, "pulse", {"stunned_ids": ["A"]})], "end": end(100, "playing", 5), "snapshots": [snapm(100, {"shades": [{"pos": [7, 0.5, 0], "state": "stunned"}]})]})
case("pulse_needs_3_motes", ["S7"], "carried 2 < pulse_cost 3: pulse does not activate (no event, nothing spent, shade not stunned).", A(3),
     sc(player={"carried": 2}, shades=[{"id": "A", "pos": [3, 0.5, 0]}]), fr({"tick": 0, "pulse": True}), snap=3,
     expect={"events": [], "end": end(3), "snapshots": [snapm(3, {"player": {"carried": 2}, "shades": [{"pos": [2.8, 0.5, 0], "state": "chase"}]})]})
case("pulse_cooldown", ["S7"], "Carry 9. Pulse at tick 0 (cost 3, event 1); pulse at tick 10 is inside the 180-tick cooldown and ignored; pulse at tick 180 (event 181) works. carried 6 at tick 100, 3 at tick 200.", A(200),
     sc(player={"carried": 9}), fr({"tick": 0, "pulse": True}, {"tick": 1, "pulse": False}, {"tick": 10, "pulse": True}, {"tick": 11, "pulse": False}, {"tick": 180, "pulse": True}, {"tick": 181, "pulse": False}), snap=100,
     expect={"events": [ev(1, "pulse", {"stunned_ids": []}), ev(181, "pulse", {"stunned_ids": []})], "end": end(200),
             "snapshots": [snapm(100, {"player": {"carried": 6, "pulse_cd_s": 1.35}}), snapm(200, {"player": {"carried": 3}})]})

# ---------------- movement, dash, jump
case("move_accel_and_camera_yaw", ["S0"], "Tick 1 speed 1 m/s (full speed 6 m/s after 6 ticks); move [1,0] with yaw 90 deg walks toward -z.", A(10),
     sc(), fr({"tick": 0, "move": [1, 0], "cam_yaw_deg": 90}), snap=1,
     expect={"events": [], "end": end(10), "snapshots": [snapm(1, {"player": {"vel": [0, 0, -1]}}), snapm(6, {"player": {"vel": [0, 0, -6]}}), snapm(10, {"player": {"pos": [0, 0, -0.75]}})]})
case("move_diagonal_normalized", ["S0"], "move [1,1] is normalised: 0.75 m along (0.707,0.707) after 10 ticks = (0.53, 0, 0.53).", A(10),
     sc(), fr({"tick": 0, "move": [1, 1]}), snap=10,
     expect={"events": [], "end": end(10), "snapshots": [snapm(10, {"player": {"pos": [0.53, 0, 0.53]}})]})
case("jump_and_no_double_jump", ["S0"], "Tick 1: vy = 7 - 20/60 = 6.667, y = 0.111. A second press in mid-air is ignored: y at tick 3 = (21-2)/60 = 0.317. Back on the ground by tick 60.", A(60),
     sc(), fr({"tick": 0, "jump": True}, {"tick": 1, "jump": False}, {"tick": 2, "jump": True}, {"tick": 3, "jump": False}), snap=1,
     expect={"events": [], "end": end(60), "snapshots": [snapm(1, {"player": {"pos": [0, 0.111, 0], "grounded": False, "vel": [0, 6.667, 0]}}), snapm(3, {"player": {"pos": [0, 0.317, 0]}}), snapm(60, {"player": {"pos": [0, 0, 0], "grounded": True}})]})
case("dash_distance_and_cooldown", ["S2"], "Dash +Z for 12 ticks at 14 m/s = 2.8 m (tick 12); cooldown 90 ticks from start: (90-11)/60 = 1.317 s left at tick 12; then slides to a stop at 3.05.", A(40),
     sc(), fr({"tick": 0, "dash": True}, {"tick": 1, "dash": False}), snap=12,
     expect={"events": [ev(1, "dash")], "end": end(40), "snapshots": [snapm(12, {"player": {"pos": [0, 0, 2.8], "dash_cd_s": 1.317, "vel": [0, 0, 6]}}), snapm(36, {"player": {"pos": [0, 0, 3.05]}})]})
case("dash_rules", ["S2"], "Dash at tick 0 (event 1); press during dash (tick 5) ignored; press at tick 50 inside cooldown ignored; press at tick 90 (event 91) allowed.", A(100),
     sc(), fr({"tick": 0, "dash": True}, {"tick": 1, "dash": False}, {"tick": 5, "dash": True}, {"tick": 6, "dash": False}, {"tick": 50, "dash": True}, {"tick": 51, "dash": False}, {"tick": 90, "dash": True}, {"tick": 91, "dash": False}),
     expect={"events": [ev(1, "dash"), ev(91, "dash")], "end": end(100)})
case("dash_uses_input_direction", ["S2"], "Dash with move [1,0] goes along +x (not the facing +z): (2.8,0,0) at tick 12.", A(12),
     sc(), fr({"tick": 0, "move": [1, 0], "dash": True}, {"tick": 1, "dash": False}), snap=12,
     expect={"events": [ev(1, "dash")], "end": end(12), "snapshots": [snapm(12, {"player": {"pos": [2.8, 0, 0]}})]})
case("dash_in_air_keeps_height", ["S2"], "Jump at tick 0, dash at tick 5: height stays y=0.5 for the whole dash (ticks 6-17), z advances 2.8.", A(17),
     sc(), fr({"tick": 0, "jump": True}, {"tick": 1, "jump": False}, {"tick": 5, "dash": True}, {"tick": 6, "dash": False}), snap=1,
     expect={"events": [ev(6, "dash")], "end": end(17), "snapshots": [snapm(5, {"player": {"pos": [0, 0.5, 0]}}), snapm(6, {"player": {"pos": [0, 0.5, 0.233]}}), snapm(17, {"player": {"pos": [0, 0.5, 2.8], "grounded": False}})]})

# ---------------- falling
fallmove = fr({"tick": 0, "move": [1, 0]}, {"tick": 20, "move": [0, 0]})
case("fall_off_island", ["S3"], "Walking off the Night 1 edge (r=40) at tick 13, free fall reaches Y<-10 at tick 72: -1 flame, all 5 motes lost. 60 ticks later (132) respawn at (0,0,0), invulnerable.", A(176),
     sc(player={"pos": [39, 0], "carried": 5}), fallmove, snap=44,
     expect={"events": [ev(72, "player_hit", {"by": "fall", "flames": 2, "dropped": 5, "lost": False})], "end": end(176),
             "snapshots": [snapm(132, {"player": {"pos": [0, 0, 0], "flames": 2, "carried": 0, "invuln": True, "grounded": True}}), snapm(176, {"player": {"pos": [0, 0, 0], "invuln": True}})]})
case("fall_ignores_invulnerability", ["S3"], "Same fall while invulnerable (1000 ticks): the fall still costs a flame.", A(100),
     sc(player={"pos": [39, 0], "carried": 5, "invuln_ticks": 1000}), fallmove,
     expect={"events": [ev(72, "player_hit", {"by": "fall", "flames": 2, "dropped": 5, "lost": False})], "end": end(100)})
case("fall_last_flame_loses", ["S3", "S10"], "Falling with 1 flame: player_hit has lost=true, game over no_flames on that tick, no respawn.", A(200),
     sc(player={"pos": [39, 0], "carried": 5, "flames": 1}), fallmove,
     expect={"events": [ev(72, "player_hit", {"by": "fall", "flames": 0, "dropped": 5, "lost": True}), ev(72, "game_over", {"result": "lost", "reason": "no_flames"})], "end": end(72, "lost", 0)})
case("island_edge_is_inclusive", ["S3"], "Standing exactly on r=40 does not fall.", A(100), sc(player={"pos": [40, 0]}),
     expect={"events": [], "end": end(100)})
case("night2_bridge_walkable", ["S1"], "Walking along the bamboo bridge (x 30 -> 39.75, z=0) does not fall.", A(100, 1, 2),
     sc(player={"pos": [30, 0]}, charms=[]), fr({"tick": 0, "move": [1, 0]}), snap=100,
     expect={"events": [], "end": end(100), "snapshots": [snapm(100, {"player": {"pos": [39.75, 0, 0]}})]})
case("night2_bridge_has_no_rail", ["S1", "S3"], "Walking sideways off the bridge (|z|>2) at tick 23: free fall, fall event at tick 82.", A(100, 1, 2),
     sc(player={"pos": [35, 0]}, charms=[]), fr({"tick": 0, "move": [0, 1]}),
     expect={"events": [ev(82, "player_hit", {"by": "fall", "flames": 2, "dropped": 0, "lost": False})], "end": end(100)})

# ---------------- bounce pads and tiers
case("pad_night2_lands_on_island_b", ["S13"], "Pad (20,0,18): launch vy 14, 24 m/s toward B's centre; movement keys (here -x) do not override. Tick 40: vel (22.581, 0.667, -8.129). Lands inside island B, on the ground.", A(130, 1, 2),
     sc(player={"pos": [20, 18]}), fr({"tick": 0, "move": [-1, 0]}), snap=40,
     expect={"events": [], "end": end(130), "snapshots": [snapm(40, {"player": {"vel": [22.581, 0.667, -8.129], "grounded": False}}), snapm(120, {"player": {"grounded": True}})],
             "checks": [{"type": "player_in_circle", "tick": 120, "circle": [70, 0, 28], "y": 0}]})
case("pad_night3_lands_on_tier2", ["S13", "S14"], "Pad (0,3,13): vy 12, 8 m/s toward -z; lands on the 6 m disc at tick 49 (z=6.467), then slides to a stop at (0,6,6).", A(80, 1, 3),
     sc(player={"pos": [0, 13]}), snap=80,
     expect={"events": [], "end": end(80), "snapshots": [snapm(80, {"player": {"pos": [0, 6, 6], "grounded": True}})]})
case("night3_inner_wall_blocks", ["S14"], "Walking from (0,0,-20) toward the 6 m disc (r<=8): the vertical wall stops Mây just outside r=8 (z in [-8.1,-8]).", A(300, 1, 3),
     sc(), fr({"tick": 0, "move": [0, 1]}), snap=300,
     expect={"events": [], "end": end(300), "checks": [{"type": "player_box", "tick": 300, "min": [-0.001, -0.001, -8.1], "max": [0.001, 0.001, -8.0]}]})
case("night3_ring_wall_blocks", ["S14"], "From (0,0,30) toward the ring (r<=24, z>0, Y=3): the wall stops Mây at z in [24, 24.1], y=0.", A(300, 1, 3),
     sc(player={"pos": [0, 30]}), fr({"tick": 0, "move": [0, -1]}), snap=300,
     expect={"events": [], "end": end(300), "checks": [{"type": "player_box", "tick": 300, "min": [-0.001, -0.001, 24.0], "max": [0.001, 0.001, 24.1]}]})
case("night3_ramp_climb", ["S14"], "Ramp at 30 deg: from r=31 walking inward, tick 40 at r=27.25 the height is 3*(30-27.25)/6 = 1.375; at tick 150 Mây stands on the ring at y=3.", A(150, 1, 3),
     sc(player={"pos": [26.846787, 15.5]}), fr({"tick": 0, "move": [0, 1], "cam_yaw_deg": -120}), snap=10,
     expect={"events": [], "end": end(150), "snapshots": [snapm(40, {"player": {"pos": [23.599, 1.375, 13.625]}}), snapm(150, {"player": {"grounded": True}})],
             "checks": [{"type": "player_box", "tick": 150, "min": [0, 2.999, 0], "max": [27, 3.001, 16]}]})
case("night3_step_off_ledge_falls_to_lower_tier", ["S14"], "Walking off the outer edge of the ring (r>24) drops Mây to tier 0 (y=0) without a fall penalty.", A(150, 1, 3),
     sc(player={"pos": [0, 20]}), fr({"tick": 0, "move": [0, 1]}), snap=150,
     expect={"events": [], "end": end(150), "snapshots": [snapm(150, {"player": {"pos": [0, 0, 34.75], "grounded": True, "flames": 3}})]})
case("night3_bell_tower_blocks", ["S14"], "On the 6 m disc, walking toward the centre is stopped by the tower (r=2): z in [2, 2.1], y=6.", A(200, 1, 3),
     sc(player={"pos": [0, 6]}), fr({"tick": 0, "move": [0, -1]}), snap=200,
     expect={"events": [], "end": end(200), "checks": [{"type": "player_box", "tick": 200, "min": [-0.001, 5.999, 2.0], "max": [0.001, 6.001, 2.1]}]})

# ---------------- wind
case("night3_wind_pushes", ["S15"], "Night 3 wind: active from tick 1800 for 300 ticks (not at 1500 or 2100); between tick 1800 and 2100 (299 pushes) a still Mây is moved 299*2/60 = 9.967 m along dir_deg.", A(2100, 1, 3),
     sc(wind_enabled=True), snap=300,
     expect={"events": [], "end": end(2100), "snapshots": [snapm(1500, {"wind": {"active": False}}), snapm(1800, {"wind": {"active": True}}), snapm(2100, {"wind": {"active": False}})],
             "checks": [{"type": "wind_push", "from": 1800, "to": 2100, "length": 9.9667}]})
case("night3_wind_disabled_flag", ["S15"], "wind_enabled=false: no wind, Mây does not move.", A(1900, 1, 3), sc(wind_enabled=False), snap=1900,
     expect={"events": [], "end": end(1900), "snapshots": [snapm(1900, {"wind": {"active": False}, "player": {"pos": [0, 0, -20]}})]})
case("night2_has_no_wind", ["S15"], "Night 2 has no wind at tick 1800.", A(1800, 1, 2), sc(wind_enabled=True), snap=1800,
     expect={"events": [], "end": end(1800), "snapshots": [snapm(1800, {"wind": {"active": False}})]})

# ---------------- drifters
case("drifter_steals_3_and_flees", ["S11"], "Chasing drifter 2 m away, Mây carries 5: touches (<=1.2 m) at tick 7, steals min(3,5)=3, flees 240 ticks, removed at tick 247 (keeps stolen=3).", A(250, 1, 2),
     sc(player={"carried": 5}, drifters=[{"pos": [2, 0], "state": "chase"}]), snap=247,
     expect={"events": [ev(7, "drifter_steal", {"drifter_id": "D1", "amount": 3, "carried": 2})], "end": end(250), "snapshots": [snapm(247, {"drifters": [{"id": "D1", "state": "removed", "stolen": 3}]})]})
case("drifter_detect_rules", ["S11"], "carried 5: idle at 10 m -> chase; idle at 20 m stays idle; chase at 16 m (>15) -> idle.", A(1, 1, 2),
     sc(player={"carried": 5}, drifters=[{"id": "D1", "pos": [10, 0], "state": "idle"}, {"id": "D2", "pos": [20, 0], "state": "idle"}, {"id": "D3", "pos": [16, 0], "state": "chase"}]), snap=1,
     expect={"events": [], "end": end(1), "snapshots": [snapm(1, {"drifters": [{"state": "chase"}, {"state": "idle"}, {"state": "idle"}]})]})
case("drifter_needs_5_motes", ["S11"], "carried 4 (<5): drifter at 10 m stays idle.", A(1, 1, 2),
     sc(player={"carried": 4}, drifters=[{"id": "D1", "pos": [10, 0], "state": "idle"}]), snap=1,
     expect={"events": [], "end": end(1), "snapshots": [snapm(1, {"drifters": [{"state": "idle"}]})]})
case("pulse_makes_chasing_drifter_flee", ["S11", "S7"], "Pulse on a chasing drifter: it flees without stealing (stolen 0), no score for it.", A(1, 1, 2),
     sc(player={"carried": 8}, drifters=[{"pos": [3, 0], "state": "chase"}]), fr({"tick": 0, "pulse": True}), snap=1,
     expect={"events": [ev(1, "pulse", {"stunned_ids": []})], "end": end(1), "snapshots": [snapm(1, {"player": {"carried": 5}, "drifters": [{"id": "D1", "state": "flee", "stolen": 0}]})]})
case("pulse_makes_fleeing_drifter_drop_loot", ["S11", "S7"], "Pulse on a fleeing drifter carrying 3: drifter_drop(3) and 3 dropped fireflies (ttl 120 ticks = 2 s) appear where it was.", A(1, 1, 2),
     sc(player={"carried": 3}, drifters=[{"pos": [3, 0], "state": "flee", "stolen": 3, "state_ticks_left": 100}]), fr({"tick": 0, "pulse": True}), snap=1,
     expect={"events": [ev(1, "drifter_drop", {"drifter_id": "D1", "amount": 3}), ev(1, "pulse", {"stunned_ids": []})], "end": end(1),
             "snapshots": [snapm(1, {"motes_active": 3, "motes": [{"id": "M1", "kind": "dropped", "ttl_s": 2, "pos": [3, 0, 0]}, {"id": "M2", "kind": "dropped"}, {"id": "M3", "kind": "dropped"}], "drifters": [{"id": "D1", "state": "flee", "stolen": 0}]})]})
case("drifter_schedule_night2", ["S11"], "Night 2: drifters appear at ticks 1200 and 2400 (D1 then D2), at most 2 alive (still 2 at 3600). Idle when Mây carries nothing.", A(3600, 1, 2),
     {"random_motes": False, "random_shades": False, "motes": [], "wind_enabled": False}, snap=1200,
     expect={"events": [], "end": end(3600), "snapshots": [snapm(0, {"drifters": []}), snapm(1200, {"drifters": [{"id": "D1", "state": "idle"}]}), snapm(2400, {"drifters": [{"id": "D1", "state": "idle"}, {"id": "D2", "state": "idle"}]}), snapm(3600, {"drifters": [{"id": "D1"}, {"id": "D2"}]})]})
case("no_drifters_night1", ["S11"], "Night 1 has no drifters.", A(1200, 1, 1), {"random_motes": False, "random_shades": False, "motes": []}, snap=1200,
     expect={"events": [], "end": end(1200), "snapshots": [snapm(1200, {"drifters": []})]})

# ---------------- charms
case("charm_pickup", ["S12"], "Charm 0.5 m away is picked on tick 1: charm_s = 600/60 = 10, charm unavailable with respawn 2700/60 = 45 s.", A(1, 1, 2),
     sc(charms=[{"pos": [0.5, 0]}]), snap=1,
     expect={"events": [ev(1, "charm_picked", {"charm_id": "C1", "charm_ticks": 600})], "end": end(1), "snapshots": [snapm(1, {"player": {"charm_s": 10}, "charms": [{"id": "C1", "available": False, "respawn_s": 45}]})]})
case("charm_respawn_timer", ["S12"], "A charm with respawn_ticks 5 becomes available again at tick 5 (and is picked at once because Mây stands next to it).", A(8, 1, 2),
     sc(charms=[{"pos": [0.5, 0], "available": False, "respawn_ticks": 5}]),
     expect={"events": [ev(5, "charm_picked", {"charm_id": "C1", "charm_ticks": 600})], "end": end(8)})
case("charm_speed_7_2", ["S12"], "With charm: speed 7.2 m/s (full after 6 ticks), 10 ticks = (1.2*21 + 4*7.2)/60 = 0.9 m.", A(10),
     sc(player={"charm_ticks": 600}), fr({"tick": 0, "move": [1, 0]}), snap=10,
     expect={"events": [], "end": end(10), "snapshots": [snapm(10, {"player": {"vel": [7.2, 0, 0], "pos": [0.9, 0, 0]}})]})
case("charm_expires", ["S12"], "charm_ticks 600: 1 tick left at tick 599 (0.017 s), over at tick 600.", A(600),
     sc(player={"charm_ticks": 600}), snap=599,
     expect={"events": [], "end": end(600), "snapshots": [snapm(599, {"player": {"charm_s": 0.017}})]})
case("charm_dash_has_no_cooldown", ["S12", "S2"], "With charm, a second dash 20 ticks after the first (cooldown would be 90) is allowed; dash_cd_s stays 0.", A(40),
     sc(player={"charm_ticks": 600}), fr({"tick": 0, "dash": True}, {"tick": 1, "dash": False}, {"tick": 20, "dash": True}, {"tick": 21, "dash": False}), snap=1,
     expect={"events": [ev(1, "dash"), ev(21, "dash")], "end": end(40), "snapshots": [snapm(1, {"player": {"dash_cd_s": 0}})]})

# ---------------- pause
case("pause_freezes_logic", ["S16"], "Pause at tick 11 (paused), resume at tick 31. While paused tick advances but sim_tick (10), time (240 - 10/60 = 239.833) and position (z=0.75) stay; snapshot state paused. After resume sim_tick 11, z=0.85.", A(31),
     sc(), fr({"tick": 0, "move": [0, 1]}, {"tick": 10, "pause": True}, {"tick": 11, "pause": False}, {"tick": 30, "pause": True}, {"tick": 31, "pause": False}), snap=1,
     expect={"events": [ev(11, "paused"), ev(31, "resumed")], "end": end(31),
             "snapshots": [snapm(10, {"state": "playing", "sim_tick": 10, "player": {"pos": [0, 0, 0.75]}}), snapm(20, {"state": "paused", "tick": 20, "sim_tick": 10, "time_left_s": 239.833, "player": {"pos": [0, 0, 0.75]}}),
                           snapm(30, {"state": "paused", "sim_tick": 10}), snapm(31, {"state": "playing", "sim_tick": 11, "player": {"pos": [0, 0, 0.85]}})]})

# ---------------- maps / contract
L1 = [[0, 0, 25], [23.8, 0, 7.7], [14.7, 0, -20.2], [-14.7, 0, -20.2], [-23.8, 0, 7.7]]
case("night1_map", ["S1", "S0"], "Night 1: 5 lanterns at the ticket coordinates, start (0,0,0), 240 s, 20 fireflies, nothing else, night_start event on tick 1.", A(1, 1, 1), {"random_shades": False}, snap=1,
     expect={"events": [ev(1, "night_start", {"night": 1})], "keep_night_start": True, "end": end(1),
             "snapshots": [snapm(0, {"night": 1, "time_left_s": 240, "player": {"pos": [0, 0, 0], "flames": 3, "grounded": True}, "lanterns": [{"id": f"L{i+1}", "pos": p, "lit": False, "deposited": 0} for i, p in enumerate(L1)], "motes_active": 20, "shades": [], "drifters": [], "charms": [], "wind": {"active": False}})]})
L2 = [[0, 0, 20], [17, 0, -10], [-17, 0, -10], [70, 0, 20], [87, 0, -10], [53, 0, -10]]
case("night2_map", ["S1", "S0"], "Night 2: 6 lanterns (two islands), 270 s, charm C1 at (35,0,0), night_start {night:2}.", A(1, 1, 2), {"random_shades": False}, snap=1,
     expect={"events": [ev(1, "night_start", {"night": 2})], "keep_night_start": True, "end": end(1),
             "snapshots": [snapm(0, {"night": 2, "time_left_s": 270, "player": {"pos": [0, 0, 0]}, "lanterns": [{"id": f"L{i+1}", "pos": p} for i, p in enumerate(L2)], "motes_active": 20, "charms": [{"id": "C1", "available": True, "respawn_s": 0}]})]})
L3 = [[0, 6, 6], [18, 3, 10], [-18, 3, 10], [35, 0, -10], [-35, 0, -10], [20, 0, -35], [-20, 0, -35]]
case("night3_map", ["S1", "S0"], "Night 3: 7 lanterns on three tiers, 300 s, charms C1 (30,0,25) and C2 (-30,0,25), start (0,0,-20).", A(1, 1, 3), {"random_shades": False}, snap=1,
     expect={"events": [ev(1, "night_start", {"night": 3})], "keep_night_start": True, "end": end(1),
             "snapshots": [snapm(0, {"night": 3, "time_left_s": 300, "player": {"pos": [0, 0, -20]}, "lanterns": [{"id": f"L{i+1}", "pos": p} for i, p in enumerate(L3)], "motes_active": 20, "charms": [{"id": "C1", "available": True}, {"id": "C2", "available": True}]})]})


# ======================================================= Phase 3 (Ticket-03, contract v1.2)
def lit(*ids, **kw):
    out = []
    for i in ids:
        d = {"id": i, "lit": True}
        d.update(kw)
        out.append(d)
    return out
def lant(n, first):  # first = fields of lantern 0, rest empty
    return [first] + [{} for _ in range(n - 1)]

case("refuel_nearest_not_full_lantern", ["T1"], "Lit lanterns lose fuel every tick, so lit L1 (1.0 m) is no longer full when Mây interacts: it is nearer than unlit L2 (1.9 m) and gets 1 firefly (ceil(1/600 units)=1): refuel amount 1, fuel back to 100, +5.", A(3),
     sc(player={"carried": 10}, lanterns=[{"id": "L1", "pos": [1.0, 0], "lit": True}, {"id": "L2", "pos": [1.9, 0]}]), fr({"tick": 0, "interact": True}), snap=3,
     expect={"events": [ev(1, "refuel", {"lantern_id": "L1", "amount": 1, "fuel": 100})], "end": end(3, "playing", 5), "snapshots": [snapm(3, {"player": {"carried": 9}})]})
case("all_lit_does_not_end_the_night", ["T3"], "All 5 lanterns lit does NOT end the Night any more (no early win): still playing at tick 100, score 0.", A(100),
     sc(time_left_s=100, lanterns=lit("L1", "L2", "L3", "L4", "L5")), snap=100,
     expect={"events": [], "end": end(100, "playing", 0), "snapshots": [snapm(100, {"state": "playing"})]})
case("dawn_survived_win_and_bonus", ["T3", "T5"], "Dawn at tick 3 with 3 of 5 lanterns lit (need ceil(0.6*5)=3): won dawn_survived. Bonus per lit lantern 50 + floor(fuel): fuel 5997/60 = 99.95 -> 99 -> 149 each = 447, + 50*3 flames = 597. No time bonus.", A(10),
     sc(time_left_s=0.05, lanterns=lit("L1", "L2", "L3")),
     expect={"events": [ev(3, "game_over", {"result": "won", "reason": "dawn_survived"})], "end": end(3, "won", 597)})
case("dawn_below_threshold_loses", ["T3"], "Only 2 of 5 lit at dawn (< 3): lost dawn, no bonus.", A(10),
     sc(time_left_s=0.05, lanterns=lit("L1", "L2")),
     expect={"events": [ev(3, "game_over", {"result": "lost", "reason": "dawn"})], "end": end(3, "lost", 0)})
case("dawn_bonus_uses_each_lanterns_fuel", ["T5"], "L1 lit with fuel 50 -> 2997/60 = 49.95 -> 49 + 50 = 99; two full lanterns 149 each; + 150 flames = 547.", A(10),
     sc(time_left_s=0.05, lanterns=[{"id": "L1", "lit": True, "fuel": 50}, {"id": "L2", "lit": True}, {"id": "L3", "lit": True}]),
     expect={"events": [ev(3, "game_over", {"result": "won", "reason": "dawn_survived"})], "end": end(3, "won", 547)})
case("threshold_night2_needs_4_of_6", ["T3"], "Night 2: ceil(0.6*6)=4. 3 lit -> lost dawn; 4 lit -> won dawn_survived.", A(10, 1, 2),
     sc(time_left_s=0.05, lanterns=lit("L1", "L2", "L3")), expect={"events": [ev(3, "game_over", {"result": "lost", "reason": "dawn"})], "end": end(3, "lost", 0)})
case("threshold_night2_4_lit_wins", ["T3"], "Night 2 with 4 lit: won.", A(10, 1, 2),
     sc(time_left_s=0.05, lanterns=lit("L1", "L2", "L3", "L4")), expect={"events": [ev(3, "game_over", {"result": "won", "reason": "dawn_survived"})], "end": {"ticks": 3, "state": "won"}})
case("threshold_night3_needs_5_of_7", ["T3"], "Night 3: ceil(0.6*7)=5. 4 lit -> lost dawn.", A(10, 1, 3),
     sc(time_left_s=0.05, lanterns=lit("L1", "L2", "L3", "L4")), expect={"events": [ev(3, "game_over", {"result": "lost", "reason": "dawn"})], "end": end(3, "lost", 0)})
case("threshold_night3_5_lit_wins", ["T3"], "Night 3 with 5 lit: won.", A(10, 1, 3),
     sc(time_left_s=0.05, lanterns=lit("L1", "L2", "L3", "L4", "L5")), expect={"events": [ev(3, "game_over", {"result": "won", "reason": "dawn_survived"})], "end": {"ticks": 3, "state": "won"}})
case("light_on_last_tick_counts", ["T3"], "Lighting L1 on the very last tick (3) makes 4 lit: won dawn_survived. Score: 10 motes*5 + 100 + bonuses (L2-L4: 149 each = 447, L1 just lit fuel 100 -> 150) + 150 flames = 897.", A(10),
     sc(time_left_s=0.05, player={"pos": [0, 24], "carried": 10}, lanterns=lit("L2", "L3", "L4")), fr({"tick": 2, "interact": True}),
     expect={"events": [ev(3, "deposit", {"lantern_id": "L1", "amount": 10, "deposited": 10}), ev(3, "lantern_lit", {"lantern_id": "L1", "relight": False}), ev(3, "game_over", {"result": "won", "reason": "dawn_survived"})], "end": end(3, "won", 897)})
case("no_flames_beats_dawn_survived", ["T3"], "Dawn reached with enough lit lanterns, but the last flame is lost on that same tick: no_flames wins.", A(10),
     sc(time_left_s=1 / 60, player={"flames": 1}, lanterns=lit("L1", "L2", "L3"), shades=[{"id": "A", "pos": [0.5, 0.5, 0]}]),
     expect={"events": [ev(1, "player_hit", {"by": "shade", "flames": 0, "dropped": 0}), ev(1, "game_over", {"result": "lost", "reason": "no_flames"})], "end": end(1, "lost", 0)})

case("fuel_decays_one_per_second", ["T1"], "Scenario-lit lantern gets fuel 100 by default and ever_lit true. It loses 1 per second: 99 at tick 60, 90 at tick 600.", A(600),
     sc(lanterns=lit("L1")), snap=60,
     expect={"events": [], "end": end(600), "snapshots": [snapm(0, {"lanterns": lant(5, {"id": "L1", "lit": True, "fuel": 100, "ever_lit": True, "relit_count": 0})}), snapm(60, {"lanterns": lant(5, {"fuel": 99})}), snapm(600, {"lanterns": lant(5, {"fuel": 90})})]})
case("lighting_sets_fuel_100", ["T1"], "First lighting: fuel 100 at the moment of lighting (tick 1); 58 decay ticks later (tick 59) fuel = 5942/60 = 99.0. Before lighting: fuel 0, ever_lit false.", A(60),
     sc(player={"pos": [0, 24], "carried": 10}), fr({"tick": 0, "interact": True}, {"tick": 1, "interact": False}), snap=59,
     expect={"events": [ev(1, "deposit", {"lantern_id": "L1", "amount": 10, "deposited": 10}), ev(1, "lantern_lit", {"lantern_id": "L1", "relight": False})], "end": end(60, "playing", 150),
             "snapshots": [snapm(0, {"lanterns": lant(5, {"fuel": 0, "ever_lit": False, "lit": False})}), snapm(59, {"lanterns": lant(5, {"lit": True, "fuel": 99, "ever_lit": True, "relit_count": 0})})]})
case("lantern_goes_out_when_fuel_is_empty", ["T1"], "fuel 0.05 = 3 units: it burns out at tick 3: lantern_out, lit false, deposited 0, ever_lit stays true.", A(5),
     sc(lanterns=[{"id": "L1", "lit": True, "fuel": 0.05}]), snap=1,
     expect={"events": [ev(3, "lantern_out", {"lantern_id": "L1"})], "end": end(5), "snapshots": [snapm(2, {"lanterns": lant(5, {"lit": True})}), snapm(3, {"lanterns": lant(5, {"lit": False, "fuel": 0, "deposited": 0, "ever_lit": True})})]})
case("relight_needs_only_5_motes", ["T2", "T5"], "A lantern that was lit before needs 5 motes: deposit 5 -> lantern_lit relight=true. Score 5*5 + 40 = 65, relit_count 1, fuel 100, capacity 10 + 2 = 12.", A(2),
     sc(player={"pos": [0, 24], "carried": 5}, lanterns=[{"id": "L1", "lit": False, "ever_lit": True}]), fr({"tick": 0, "interact": True}), snap=1,
     expect={"events": [ev(1, "deposit", {"lantern_id": "L1", "amount": 5, "deposited": 5}), ev(1, "lantern_lit", {"lantern_id": "L1", "relight": True})], "end": end(2, "playing", 65),
             "snapshots": [snapm(1, {"player": {"capacity": 12}, "lanterns": lant(5, {"lit": True, "fuel": 100, "ever_lit": True, "relit_count": 1})})]})
case("refuel_full_amount", ["T1"], "Lit L1 at fuel 40 (2400 units; 2399 after this tick's decay): used = min(10, ceil(3601/600)=7) = 7 fireflies; fuel back to 100; +35; carried 3; capacity unchanged.", A(3),
     sc(player={"pos": [0, 24], "carried": 10}, lanterns=[{"id": "L1", "lit": True, "fuel": 40}]), fr({"tick": 0, "interact": True}), snap=1,
     expect={"events": [ev(1, "refuel", {"lantern_id": "L1", "amount": 7, "fuel": 100})], "end": end(3, "playing", 35), "snapshots": [snapm(1, {"player": {"carried": 3, "capacity": 10}, "lanterns": lant(5, {"fuel": 100})})]})
case("refuel_partial", ["T1"], "Only 2 fireflies: fuel (2399 + 1200)/60 = 59.98 -> 60.0; +10; carried 0.", A(3),
     sc(player={"pos": [0, 24], "carried": 2}, lanterns=[{"id": "L1", "lit": True, "fuel": 40}]), fr({"tick": 0, "interact": True}),
     expect={"events": [ev(1, "refuel", {"lantern_id": "L1", "amount": 2, "fuel": 60})], "end": end(3, "playing", 10)})
case("refuel_without_fireflies_does_nothing", ["T1"], "carried 0: no refuel, no event.", A(3),
     sc(player={"pos": [0, 24]}, lanterns=[{"id": "L1", "lit": True, "fuel": 40}]), fr({"tick": 0, "interact": True}),
     expect={"events": [], "end": end(3)})
case("capacity_grows_with_lights", ["T4"], "successful_lights 3 -> capacity 16. With 15 carried only one of two motes is picked (carried 16).", A(2),
     sc(player={"carried": 15, "successful_lights": 3}, motes=[[0.5, 0], [0.5, 0]]), snap=2,
     expect={"events": [ev(1, "mote_picked", {"carried": 16})], "end": end(2), "snapshots": [snapm(2, {"motes_active": 1, "player": {"capacity": 16, "carried": 16}})]})
case("capacity_is_capped_at_20", ["T4"], "successful_lights 7 -> min(20, 10+14) = 20.", A(1), sc(player={"successful_lights": 7}), snap=1,
     expect={"events": [], "end": end(1), "snapshots": [snapm(1, {"player": {"capacity": 20}})]})
case("low_fuel_removes_safe_zone", ["T2"], "L1 fuel 30.05 (1803 units): zone still active at tick 3 (exactly 30.0), gone from tick 4. Shade starting 6.5 m from L1 is not blocked afterwards: tick 10 distance 6.5-10*0.0667 = 5.833 -> z = 30.833.", A(10),
     sc(player={"pos": [0, 25]}, lanterns=[{"id": "L1", "lit": True, "fuel": 30.05}], shades=[{"id": "A", "pos": [0, 0.5, 31.5]}]), snap=10,
     expect={"events": [], "end": end(10), "snapshots": [snapm(10, {"shades": [{"id": "A", "pos": [0, 0.5, 30.833]}]})]})
case("wander_heads_for_nearest_unlit_lantern", ["T2"], "No weak lantern: a wandering shade walks to the nearest unlit lantern (L3) at shade speed 4 m/s: 30 ticks = 2.0 m (z -10.2 -> -12.2).", A(30),
     sc(lanterns=lit("L1", "L2", "L4", "L5"), player={"pos": [0, 30]}, shades=[{"id": "A", "pos": [14.7, 0.5, -10.2], "state": "wander"}]), snap=30,
     expect={"events": [], "end": end(30), "snapshots": [snapm(30, {"shades": [{"id": "A", "pos": [14.7, 0.5, -12.2], "state": "wander"}]})]})
case("wander_prefers_weak_lit_lantern", ["T2"], "A weak lit lantern (L1, fuel 20 < 30) beats the nearer unlit L3: after 30 ticks the shade has moved 2 m toward L1 (14.7,-10.2) -> (13.929,-8.354).", A(30),
     sc(lanterns=[{"id": "L1", "lit": True, "fuel": 20}], player={"pos": [30, 30]}, shades=[{"id": "A", "pos": [14.7, 0.5, -10.2], "state": "wander"}]), snap=30,
     expect={"events": [], "end": end(30), "snapshots": [snapm(30, {"shades": [{"id": "A", "pos": [13.929, 0.5, -8.354], "state": "wander"}]})]})
case("shade_arrives_and_drains", ["T2"], "Shade 4.9 m from weak L1 (fuel 20.05 = 1203 units): at tick 45 it is 1.967 m away -> state drain (z 26.967). From tick 46 fuel falls 6 units/tick (1 + 5): fuel_drain event every 60 ticks: tick 105, fuel (1158 - 360)/60 = 13.3.", A(110),
     sc(lanterns=[{"id": "L1", "lit": True, "fuel": 20.05}], player={"pos": [0, -30]}, shades=[{"id": "A", "pos": [0, 0.5, 29.9], "state": "wander"}]), snap=45,
     expect={"events": [ev(105, "fuel_drain", {"lantern_id": "L1", "shade_id": "A", "fuel": 13.3})], "end": end(110), "snapshots": [snapm(45, {"shades": [{"id": "A", "pos": [0, 0.5, 26.967], "state": "drain"}], "lanterns": lant(5, {"fuel": 19.3})})]})
case("two_drainers_stack", ["T2"], "Two shades draining L1: 1 + 5 + 5 = 11 units per tick: 10 ticks from 1203 -> 1093 = 18.2.", A(10),
     sc(lanterns=[{"id": "L1", "lit": True, "fuel": 20.05}], player={"pos": [0, -30]},
        shades=[{"id": "A", "pos": [0, 0.5, 26.5], "state": "drain", "target_lantern_id": "L1"}, {"id": "B", "pos": [1, 0.5, 26], "state": "drain", "target_lantern_id": "L1"}]), snap=10,
     expect={"events": [], "end": end(10), "snapshots": [snapm(10, {"lanterns": lant(5, {"fuel": 18.2}), "shades": [{"state": "drain"}, {"state": "drain"}]})]})
case("drain_becomes_chase_near_player", ["T2"], "Mây within 6 m (5.4 m) of a draining shade: drain -> chase.", A(1),
     sc(lanterns=[{"id": "L1", "lit": True, "fuel": 20}], player={"pos": [0, 21.5]}, shades=[{"id": "A", "pos": [0, 0.5, 26.9], "state": "drain", "target_lantern_id": "L1"}]), snap=1,
     expect={"events": [], "end": end(1), "snapshots": [snapm(1, {"shades": [{"state": "chase"}]})]})
case("drain_ends_when_fuel_reaches_30", ["T2"], "Lantern at fuel 31 is not weak: the shade stops draining (drain -> wander).", A(1),
     sc(lanterns=[{"id": "L1", "lit": True, "fuel": 31}], player={"pos": [0, -30]}, shades=[{"id": "A", "pos": [0, 0.5, 26.5], "state": "drain", "target_lantern_id": "L1"}]), snap=1,
     expect={"events": [], "end": end(1), "snapshots": [snapm(1, {"shades": [{"state": "wander"}]})]})
case("drain_ends_when_lantern_goes_out", ["T2"], "fuel 0.05 (3 units) drained at 6/tick: lantern_out at tick 1 and the shade goes back to wander.", A(1),
     sc(lanterns=[{"id": "L1", "lit": True, "fuel": 0.05}], player={"pos": [0, -30]}, shades=[{"id": "A", "pos": [0, 0.5, 26.5], "state": "drain", "target_lantern_id": "L1"}]), snap=1,
     expect={"events": [ev(1, "lantern_out", {"lantern_id": "L1"})], "end": end(1), "snapshots": [snapm(1, {"shades": [{"state": "wander"}], "lanterns": lant(5, {"lit": False, "deposited": 0, "ever_lit": True})})]})
case("pulse_on_draining_shade_scores_15", ["T5", "T2"], "Pulse hits a draining shade (+15) and a chasing shade (+5): 20, both stunned.", A(2),
     sc(player={"pos": [0, 23], "carried": 3}, lanterns=[{"id": "L1", "lit": True, "fuel": 20}],
        shades=[{"id": "A", "pos": [0, 0.5, 26.5], "state": "drain", "target_lantern_id": "L1"}, {"id": "B", "pos": [4, 0.5, 23]}]), fr({"tick": 0, "pulse": True}), snap=2,
     expect={"events": [ev(1, "pulse", {"stunned_ids": ["A", "B"]})], "end": end(2, "playing", 20), "snapshots": [snapm(2, {"shades": [{"state": "stunned"}, {"state": "stunned"}]})]})
case("refuel_over_30_pushes_shades_out", ["T2"], "Refuelling a weak lantern past 30 (3 motes: (1202+1800)/60 = 50.0) pushes shades inside 6 m out evenly over 30 ticks and they cannot hurt Mây meanwhile: tick 1 a shade 3 m from L1 is 3.1 m away (z 28.1).", A(1),
     sc(player={"pos": [0, 24], "carried": 3}, lanterns=[{"id": "L1", "lit": True, "fuel": 20.05}], shades=[{"id": "A", "pos": [0, 0.5, 28]}]), fr({"tick": 0, "interact": True}), snap=1,
     expect={"events": [ev(1, "refuel", {"lantern_id": "L1", "amount": 3, "fuel": 50})], "end": end(1, "playing", 15), "snapshots": [snapm(1, {"shades": [{"pos": [0, 0.5, 28.1]}]})]})
cases.append({"name": "cli_lantern_fuel_out_of_range", "covers": ["T1"], "why": "lantern fuel must be in [0,100].", "args": {"seed": 1, "ticks": 5, "night": 1}, "scenario": {"lanterns": [{"id": "L1", "lit": True, "fuel": 150}]}, "expect_exit": 2})

# ---------------- errors
for name, why, night, scn, inp in [
    ("cli_night_out_of_range", "--night 4 is invalid", 4, None, None),
    ("cli_shade_state_name", "Unknown shade state name", 1, {"shades": [{"pos": [3, 0], "state": "lurking"}]}, None),
    ("cli_drifter_state_name", "Unknown drifter state name", 2, {"drifters": [{"pos": [3, 0], "state": "hover"}]}, None),
    ("cli_pause_not_boolean", "pause must be boolean", 1, None, '{"frames":[{"tick":0,"pause":1}]}'),
    ("cli_bad_inputs_non_increasing", "Frame ticks must strictly increase.", 1, None, '{"frames":[{"tick":3},{"tick":2}]}'),
    ("cli_bad_inputs_move_range", "move components must be in [-1,1].", 1, None, '{"frames":[{"tick":0,"move":[2,0]}]}'),
    ("cli_inputs_not_json", "Malformed JSON.", 1, None, '{not json'),
    ("cli_scenario_unknown_lantern", "Unknown lantern id.", 1, {"lanterns": [{"id": "L9", "lit": True}]}, None),
    ("cli_scenario_night1_has_no_L6", "L6 does not exist in Night 1.", 1, {"lanterns": [{"id": "L6", "lit": True}]}, None),
    ("cli_scenario_wrong_type", "player.carried must be a non-negative integer.", 1, {"player": {"carried": "many"}}, None),
]:
    c = {"name": name, "covers": ["S17"], "why": why, "args": {"seed": 1, "ticks": 5, "night": night}, "expect_exit": 2}
    if scn is not None: c["scenario"] = scn
    if inp is not None: c["inputs_raw"] = inp
    cases.append(c)
cases.append({"name": "cli_missing_out", "covers": ["S17"], "why": "--out is required.", "args": {"seed": 1, "ticks": 5}, "omit": ["out"], "expect_exit": 2})
cases.append({"name": "cli_scenario_file_missing", "covers": ["S17"], "why": "Scenario path does not exist.", "args": {"seed": 1, "ticks": 5}, "scenario_path": "does/not/exist.json", "expect_exit": 2})

json.dump({"_note": "Expected values are computed BY HAND from game.contract.json (v1.1) and Ticket-02 (see docs/notes/phase2-assumptions.md). Never paste them from game output. Events named night_start are ignored unless expect.keep_night_start.", "cases": cases},
          open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "cases", "cases.json"), "w", encoding="utf8"), indent=1, ensure_ascii=False)
print(len(cases), "cases")
