# Changelog

## Phase 3: "Đèn cạn dầu" (contract v1.2, tag `phase-3`)

### Thay đổi phá vỡ tương thích (breaking)

- **Luật thắng:** thắp đủ đèn không còn kết thúc Đêm. Thắng chỉ khi hết giờ, còn sống và số đèn sáng ≥ `ceil(0.6 × tổng)` (3/5, 4/6, 5/7). `game_over.reason`: `dawn_survived` (thắng), `dawn`, `no_flames` (thua); `all_lit` bỏ.
- **Thời lượng Đêm:** 300/330/360 s → 240/270/300 s.
- **Đèn có nhiên liệu** (100, hao 1/s). Đèn sáng nhận đom đóm để châm dầu (trước đây từ chối); hết dầu thì tắt (`lantern_out`); thắp lại chỉ cần 5 đom đóm.
- **Vùng an toàn** chỉ còn khi `lit` và `fuel ≥ 30`. Bóng Mực có trạng thái mới `drain` (hút 5 fuel/s, đứng yên ≤ 2 m cách đèn yếu).
- **`wander` của Bóng Mực** đi tới đèn sáng yếu gần nhất, không có thì tới đèn tắt gần nhất (Phase 2 đi lang thang ngẫu nhiên).
- **Điểm:** +5 mỗi đom đóm nạp (trước +10), +100 thắp đầu, +40 thắp lại, +5/+15 mỗi Bóng Mực trúng Tỏa Sáng (+15 nếu đang `drain`), thưởng bình minh +50 + `floor(fuel)` mỗi đèn sáng và +50 mỗi Ngọn Lửa; **bỏ thưởng thời gian**.
- **Sức chứa** tăng theo lần thắp: `min(20, 10 + 2 × successful_lights)`, đặt lại mỗi Đêm.
- **Contract v1.2:** thêm tuning (`fuel_max`, `fuel_decay_per_s`, `fuel_per_mote`, `relight_cost`, `win_ratio`, `drain_per_s`, `low_fuel_threshold`, `capacity_max`, thời lượng mới) và khóa điểm `per_relight`, `per_stun_drain`, `per_lit_dawn`; snapshot (`fuel`, `ever_lit`, `relit_count`, `player.capacity`); scenario (`lanterns[].fuel/ever_lit`, `player.successful_lights`, `shades[].target_lantern_id`); sự kiện `refuel`, `lantern_out`, `fuel_drain`, `lantern_lit.relight`.

### Thêm

- Thanh dầu trên đèn, đèn và thanh dầu nhấp nháy khi `fuel < 30`; đèn tắt xẹp 20% và có vết rách.
- Cài đặt "Bảng màu dễ phân biệt" (lưu lại): viền/mắt Bóng Mực xanh lam, cảnh báo trắng kèm ⚠.
- Mắt cho Bóng Mực; giao diện làm lại (thẻ kính mờ, nút, menu có đom đóm bay); HUD `đang mang / sức chứa`, "cần k đèn lúc bình minh", gợi ý "E — Châm dầu".

## Phase 2: "Ba hòn đảo" (contract v1.1, tag `phase-2`)

Ba Đêm, lướt, rơi khỏi đảo, bục nhảy, Gió Lạc, Bùa Gió, gió mạnh, tạm dừng, cài đặt, âm thanh. Chi tiết: `docs/notes/phase2-regression.md`.

## Phase 1 (contract v1.0, tag `phase-1`)

Đêm 1 chơi được, headless theo Test Contract v1.0.
