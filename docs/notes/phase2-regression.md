# Phase 2: hồi quy từ Phase 1 (S20)

Ticket-02 thay số liệu chuẩn nên 24 case Phase 1 (giá trị tính tay theo số Phase 1) không thể chạy nguyên văn trên contract v1.1. Mỗi case được tính lại tay theo số chuẩn mới; các test Phase 1 vẫn nằm ở tag `phase-1` (bằng chứng ở `docs/proof/phase1/` khớp mã ở tag đó).

## Phase 1 tuning → Phase 2 chuẩn

| Khóa | Phase 1 (tự chọn) | Phase 2 (chuẩn) |
|---|---|---|
| carry_capacity | 5 | 10 |
| lantern_cost | 5 | 10 |
| interact_radius | 2.5 | 2.0 |
| pulse_cost / radius / cooldown | 1 / 6 / 1 s | 3 / 5 / 3 s |
| pulse_stun / push | 3 s / 2 m | 2 s (120 tick) / 4 m trong 15 tick |
| night1_duration_s | 180 | 300 |
| safe_radius | 4 (mọi đèn) | 6 (chỉ đèn đã sáng) |
| shade_speed / hit_radius | 3 / 0.8 | 4.0 (Đêm 3: 4.5) / 1.0 |
| fall_enabled | false (rào vô hình) | true (rơi thật, Y < -10) |
| score.per_mote | 10 khi nhặt | 10 khi nạp vào đèn |
| score.per_stun | 20 | 5 |
| score.per_second_left | 1 | 2 |
| nhảy | 8 m/s | 7 m/s |
| bản đồ Đêm 1 | đảo bán kính 30, đèn trên vòng bán kính 15 | đảo bán kính 40, đèn tại tọa độ chuẩn |

## Case Phase 1 → case Phase 2

| Case Phase 1 | Phase 2 | Lý do đổi |
|---|---|---|
| pickup_mote, pickup_out_of_range_and_full | pickup_mote, pickup_height_tolerance, pickup_xz_radius, pickup_capacity_10 | điểm không còn tính khi nhặt; sức chứa 10; thêm điều kiện chênh cao ≤ 1.5 |
| deposit_and_light, deposit_partial, deposit_out_of_range | deposit_and_light, deposit_remembers_progress, deposit_out_of_range, deposit_tie_smaller_id, deposit_nearest, deposit_skips_lit_lanterns | cost 10; đèn nhớ tiến độ; luật chọn đèn |
| win_all_lit | win_all_lit, win_on_timeout_tick, prelit_all_wins_without_points | công thức điểm thắng đổi (×2 mỗi giây); thắng ở bước 11, ưu tiên hơn `dawn` |
| dawn_loss | dawn_loss, no_flames_beats_dawn | `no_flames` luôn thắng thế |
| shade_hits_until_lost | shade_hits_until_lost (cùng thời điểm hit 1/91/181 và số đom đóm rơi) | thêm kiểm tra trạng thái `recoil` (bóng lùi 2 m trong 60 tick), vành rơi 1.5-2.5 m và TTL 480 |
| pulse_stuns_in_radius, pulse_cooldown_and_miss, pulse_without_light | pulse_3d_range_and_score, pulse_push_and_stun_timing, pulse_refreshes_stun, pulse_needs_3_motes, pulse_cooldown, pulse_radius_boundary | bán kính 3D từ chân + 0.8; cost 3 (không đủ thì không kích hoạt); **pulse lại làm mới choáng và vẫn cộng +5 (đảo giả định A20 của Phase 1)** |
| shade_blocked_by_safe_radius | safe_zone_blocks_shade, safe_zone_ejects_and_is_harmless | vùng an toàn 6 m chỉ cho đèn đã sáng; bóng trong vùng bị đẩy ra trong ≤ 30 tick |
| random_shade_spawn_schedule | shade_schedule_night1/2/3, shade_cap_night1, shade_spawn_keeps_15m_from_player | 2 bóng ở tick 300 rồi theo chu kỳ từng Đêm; điểm sinh cố định; tối đa 6/8/10 |
| move_yaw_and_normalize, move_diagonal_normalized, jump_first_tick | move_accel_and_camera_yaw, move_diagonal_normalized, jump_and_no_double_jump | tăng tốc trong 6 tick làm đổi quãng đường (0.75 m sau 10 tick thay vì 1.0 m); nhảy 7 m/s |
| cli_* (7 case lỗi) | cli_* (12 case lỗi) | thêm lỗi cho `--night 4`, tên trạng thái, `pause` không phải boolean |
| (không có) | dash_*, fall_*, night2_*, night3_*, drifter_*, charm_*, pause_*, mote_*, night{1,2,3}_map | tính năng mới, mỗi mục ít nhất 1 scenario |

Hành vi Phase 1 không đổi và vẫn được kiểm: định dạng output JSONL, tất định cùng seed, mã thoát 2, quy ước `tick` của event, `night_start` mới ở tick 1.

## Khác biệt vẫn có thể lệch với test ẩn

Các điểm Ticket-02 chưa quy định rõ và ta tự chọn (B1-B26 trong `phase2-assumptions.md`) có thể khác kỳ vọng của người chấm. Rủi ro lớn nhất: vị trí xuất phát Đêm 2/3 (B2), mô hình tăng tốc 6 tick (B3), hành vi `wander`/`spawning`/`recoil` (B4-B6), thời điểm sinh Gió Lạc và chọn điểm sinh ngẫu nhiên (B10, B23), `night_start` phát ở tick 1 (B17).
