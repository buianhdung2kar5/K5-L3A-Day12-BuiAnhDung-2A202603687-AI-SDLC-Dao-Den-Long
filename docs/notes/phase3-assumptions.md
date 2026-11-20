# Phase 3: giả định, hồi quy và trạng thái

Nguồn: [ticket-03.md](ticket-03.md). Quyết định thiết kế: [adr-0001-fuel-model-and-dawn-win.md](adr-0001-fuel-model-and-dawn-win.md). Breaking changes: [../../CHANGELOG.md](../../CHANGELOG.md). Giả định Phase 1-2 vẫn dùng, trừ chỗ bị thay thế dưới đây.

## Giả định mới (chỗ Ticket-03 chưa quy định)

| # | Chỗ mơ hồ | Giả định |
|---|---|---|
| C1 | `wander` đi tới đèn: tốc độ? | Dùng `shade_speed` (4.0; Đêm 3: 4.5). Khi không còn đèn yếu hay đèn tắt thì đi lang thang ngẫu nhiên 2 m/s như Phase 2. **Sửa giả định B5 của Phase 2** (ticket viết "như trước" nghĩa là hành vi nền đã là đi tới đèn tắt) |
| C2 | Khi nào vào `drain` | Bóng `wander` cách đèn đích ≤ 2 m (XZ, kiểm tra đầu bước 8, rồi đứng yên), và đèn đích đang sáng với `fuel < 30`. Tới đèn tắt thì chỉ đứng cạnh, không `drain` |
| C3 | `fuel_drain` | Mỗi bóng đang `drain` phát một sự kiện mỗi 60 tick tính từ lúc nó bắt đầu hút; `fuel` là giá trị sau cập nhật tick đó |
| C4 | `refuel.amount` | Số đom đóm đã dùng (`used`); `fuel` là giá trị sau khi châm (1 chữ số thập phân) |
| C5 | Scenario đèn | `lit: true` mà không có `fuel` thì 100; `ever_lit` mặc định bằng `lit`; đèn `lit: false` thì `fuel = 0`, `deposited = 0` |
| C6 | `target_lantern_id` | Với bóng `wander` là đèn đích cố định (bỏ qua việc chọn đèn yếu); với bóng `drain` là đèn đang bị hút |
| C7 | `successful_lights` | Đếm sự kiện `lantern_lit` (lần đầu và thắp lại), không đếm `refuel`; đèn đặt sẵn không đếm |
| C8 | `relit_count` | Số lần đèn đó được thắp lại |
| C9 | Khóa điểm trong `tuning.score` | Ngoài `per_mote` (5), `per_lantern` (100), `per_stun` (5), `per_flame_left` (50), `per_second_left` (0) còn thêm `per_relight` (40), `per_stun_drain` (15), `per_lit_dawn` (50) |
| C10 | Thắng ở tick bình minh | Xét sau mọi cập nhật của tick: `no_flames` trước, rồi đếm đèn đang sáng (kể cả đèn thắp ở chính tick đó) |
| C11 | Thứ tự chuyển trạng thái từ `drain` | Theo thứ tự ticket liệt kê: nếu Mây trong 6 m thì sang `chase` trước; sau đó đèn tắt / `fuel ≥ 30` / cách đèn > 2 m thì sang `wander`. Bóng `drain` không gây sát thương (tới khi chạm đã thành `chase`) |
| C12 | Đèn vừa tắt | `deposited = 0`, vùng an toàn mất, không đẩy bóng nào |
| C13 | Ngưỡng thắng | `ceil(round(0.6 × tổng × 1e9) / 1e9)` để tránh sai số số thực (3, 4, 5) |
| C14 | `per_second_left` | Giữ khóa trong contract với giá trị 0 vì ticket bỏ thưởng thời gian |
| C15 | HUD "E — Nạp ánh sáng (x/10)" | Đèn chưa sáng: tiến độ đã nạp / chi phí (10, hoặc 5 nếu đã từng sáng). Đèn sáng chưa đầy: "E — Châm dầu (fuel/100)" |

## Tiêu chí nghiệm thu

| ID | Tiêu chí |
|---|---|
| T1 | Nhiên liệu: 100 khi thắp, hao 1/s, châm dầu theo công thức (`ceil`), đèn đầy không bị chọn, hết dầu thì tắt (`lantern_out`) |
| T2 | Bóng Mực hút dầu: chọn đèn yếu gần nhất, `drain` ≤ 2 m, 5/s cộng dồn, sự kiện `fuel_drain` mỗi 60 tick, các chuyển trạng thái, mất vùng an toàn khi `fuel < 30`, đẩy ra khi châm lại ≥ 30 |
| T3 | Luật thắng: không thắng sớm, ngưỡng 3/5, 4/6, 5/7, `dawn_survived`/`dawn`/`no_flames`, thời lượng 240/270/300 |
| T4 | Sức chứa `min(20, 10 + 2 × successful_lights)` |
| T5 | Điểm mới (+5 mỗi đom đóm, +100, +40, +5/+15, thưởng bình minh, không thưởng thời gian) |
| T6 | Bảng màu dễ phân biệt được lưu; đèn tắt xẹp 20% + vết rách; đèn yếu nhấp nháy |
| T7 | Contract v1.2 (snapshot, scenario, sự kiện) và hồi quy Phase 1-2 |

## Hồi quy: test cũ bị luật mới làm sai (cập nhật có lý do)

| Case Phase 2 | Xử lý | Lý do |
|---|---|---|
| deposit_and_light, deposit_remembers_progress, deposit_tie_smaller_id, deposit_nearest, safe_zone_ejects_and_is_harmless | Sửa điểm mong đợi 200 → 150 | mỗi đom đóm nạp giờ +5 (10 × 5 + 100) |
| deposit_skips_lit_lanterns | Thay bằng `refuel_nearest_not_full_lantern` | đèn sáng giờ nhận đom đóm để châm dầu |
| win_all_lit, win_on_timeout_tick, prelit_all_wins_without_points | Xóa, thay bằng `all_lit_does_not_end_the_night`, `dawn_survived_win_and_bonus`, `dawn_below_threshold_loses`, `light_on_last_tick_counts` và các case ngưỡng | thắng chỉ ở bình minh; không còn thưởng thời gian; `all_lit` bỏ |
| pause_freezes_logic, night1/2/3_map | Sửa thời gian 300/330/360 → 240/270/300 | thời lượng mới |
| shade_* và các test còn lại | Không đổi (vẫn đạt) | không bị ảnh hưởng |

Test bị xóa hoặc sửa đều nằm trong `tests/gen_cases.py` với phần `why` nêu công thức tính tay. Không có test nào bị `skip`.

## Trạng thái (cuối Phase 3)

- Headless (T1-T5, T7): xem `docs/proof/phase3/results.md`. Giá trị mong đợi tính tay; kiểm tra đột biến (sửa 6 tuning trong contract thì 12 case đỏ).
- Game (T6 và giao diện): xem `docs/proof/phase3/e2e-results.md`.
- **Chưa kiểm tra / chưa đạt:** âm thanh chưa nghe thử; kéo chuột xoay camera; hiệu ứng nhấp nháy 1 Hz chỉ kiểm bằng mắt (không có test tự động đo tần số); vết rách giấy là các thanh mảnh tối trên quả đèn (chưa phải texture giấy); mọi giả định C1-C15 chưa được đối chiếu với test ẩn (rủi ro lớn nhất: C1 tốc độ `wander`, C11 thứ tự chuyển trạng thái, C3 mốc đếm 60 tick).
- **Yêu cầu ngoài ticket:** người dùng đề nghị dùng nhân vật Songoku và hồn ma của Gotenks (Dragon Ball). Không thực hiện vì RULES.md mục 8 cấm dùng nhân vật/thương hiệu có sẵn; giữ nhân vật gốc Mây và Bóng Mực, làm lại giao diện.
