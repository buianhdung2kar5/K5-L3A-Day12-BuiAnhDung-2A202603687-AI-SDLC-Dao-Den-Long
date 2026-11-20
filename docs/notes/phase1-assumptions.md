# Phase 1: Giả định và tiêu chí nghiệm thu

Nguồn: PRD-0 + Test Contract v1.0 trên lab board. Công nghệ: TypeScript, Node (mô phỏng + headless), Babylon.js (hiển thị, web tĩnh).

## Giả định cho chỗ mơ hồ

| # | Chỗ mơ hồ | Giả định | Giá trị / hành vi |
|---|---|---|---|
| A1 | `flames` vs "máu" | `flames` là máu của Mây. Mỗi lần trúng bóng mất 1 | `flames` = 3 |
| A2 | `dawn` | Hết `night1_duration_s` mà chưa thắp đủ 5 đèn thì thua, `reason: "dawn"` | 180 s |
| A3 | Pulse trượt | `pulse_cost` bị trừ kể cả khi không trúng bóng nào. Nếu `carried < pulse_cost` thì pulse không phát và không có event | cost = 1 đom đóm đang mang |
| A4 | "Ánh sáng" | Ánh sáng = đom đóm đang mang (`carried`). Dùng chung cho nạp đèn và pulse | |
| A5 | `dash` | Không làm | |
| A6 | `fall_enabled` | `false`: đảo có rào vô hình, không rơi, không có event `player_hit` với `by: "fall"` | false |
| A7 | `carry_capacity` đầy | Không nhặt thêm; đom đóm vẫn nằm trên đất, không có event | 5 |
| A8 | Bán kính | `pickup_radius` áp cho đom đóm, `interact_radius` áp cho đèn lồng | 1.0 / 2.5 |
| A9 | `lantern_cost` | Mỗi đèn cần `deposited >= lantern_cost` thì sáng. Nạp tối đa phần còn thiếu, phần thừa giữ lại | 5 |
| A10 | `interact` | Một lần bấm (false sang true) nạp toàn bộ `carried` (tối đa phần còn thiếu) vào đèn gần nhất trong `interact_radius` | |
| A11 | Điểm | Cộng ngay khi có sự kiện. Thắng thì cộng thêm `per_second_left * time_left_s` (làm tròn xuống) và `per_flame_left * flames`. Thua thì không cộng thưởng | |
| A12 | `hit_drop_ratio` | Khi trúng bóng, rơi `floor(carried * 0.5)` đom đóm; số này được ghi trong `dropped` | 0.5 |
| A13 | `invuln_s` | Sau mỗi lần trúng, 1.5 s không bị trúng tiếp | 1.5 |
| A14 | Bóng choáng | Choáng thì đứng yên `pulse_stun_s`, vẫn bị đẩy lùi `pulse_push_m` khi trúng pulse. Bóng choáng không gây sát thương | 3.0 s / 2.0 m |
| A15 | `safe_radius` | Bóng không đi vào vòng bán kính này quanh mọi đèn (kể cả chưa sáng); bị chặn ở rìa | 4.0 |
| A16 | Spawn bóng | Bóng spawn ở rìa đảo theo RNG có seed, tối đa vài con cùng lúc; event `shade_spawned` ghi id dạng `S1`, `S2`... | |
| A17 | `motes` trong snapshot | Có xuất mảng `motes` cho an toàn | |
| A18 | `null` vs `false` | Tham số số không có khái niệm thì dùng `null`, tham số bật/tắt dùng `false`. Hiện tại mọi khái niệm đều có | |
| A19 | Thứ tự tick | Trong mỗi bước: đọc input, di chuyển người chơi, xử lý nhặt, interact, pulse, di chuyển bóng, va chạm, kiểm tra thắng/thua | |
| A20 | Pulse với bóng đã choáng | Bóng đang `stunned` không bị choáng lại, không bị đẩy, không có trong `stunned_ids`, không cộng điểm | |
| A21 | Định dạng vị trí trong scenario | Chấp nhận `[x,z]` (y mặc định 0, bóng 0.5) hoặc `[x,y,z]` | |
| A22 | `random_motes: false` | Không sinh đom đóm ngẫu nhiên (trừ khi có `motes`). Mặc định 40 đom đóm, không sinh thêm khi chơi | |
| A23 | Bóng ngẫu nhiên | Spawn đầu tiên ở giây 5, rồi mỗi 8 s, tối đa 4 con, ở rìa đảo (bán kính 28). Bóng trong scenario không phát `shade_spawned` | |
| A24 | Hằng số ngoài contract | Nhảy, trọng lực, bán kính đảo (30), vòng đèn (15) nằm trong `src/sim/tuning.ts` | |
| A25 | Snapshot cuối | Không thêm snapshot ngoài lịch `--snapshot-every`; trạng thái cuối nằm ở dòng `end` | |
| A26 | Lỗi tham số CLI | Thiếu hoặc sai tham số dòng lệnh cũng thoát mã 2 | |

## Tiêu chí nghiệm thu (làm A thì thấy B)

| ID | Tiêu chí | Cách kiểm chứng |
|---|---|---|
| R1 | Cùng seed, scenario, inputs chạy hai lần cho output giống hệt từng byte | Chạy hai lần, so sánh |
| R2 | Đứng cạnh đom đóm (trong `pickup_radius`) thì có `mote_picked`, `carried` tăng 1 | Scenario mote |
| R3 | `interact` gần đèn khi đang mang đom đóm thì có `deposit`; đủ `lantern_cost` thì có `lantern_lit` | Scenario deposit |
| R4 | Thắp đủ 5 đèn thì `game_over` `won` lý do `all_lit`, state `won` | Scenario win |
| R5 | Bóng chạm Mây thì `player_hit` `by: "shade"`, `flames` giảm 1, `dropped` đúng | Scenario hit |
| R6 | `flames` về 0 thì `game_over` `lost` lý do `no_flames` | Scenario lose |
| R7 | Hết giờ chưa đủ đèn thì `game_over` `lost` lý do `dawn` | Scenario dawn (`time_left_s` nhỏ) |
| R8 | `pulse` làm bóng trong `pulse_radius` có state `stunned` và có trong `stunned_ids` | Scenario pulse |
| R9 | Bóng không vào `safe_radius` quanh đèn | Scenario shade gần đèn |
| R10 | Điểm khớp bảng `score` | Tính tay rồi so |
| R11 | Input hoặc scenario hỏng thì exit code 2 và có thông báo ở stderr | Chạy với file hỏng |
| R12 | Game có đồ họa chơi từ đầu đến thắng hoặc thua và chơi lại được | Ảnh chụp, chơi thử |
| R13 | README cài và chạy trong tối đa 3 lệnh | Clone sạch, chạy thử |

Lưu ý khi kiểm chứng: giá trị mong đợi trong scenario phải tính bằng tay từ tuning, không sao chép từ output của game.

## Trạng thái (sau Bước 2)

- Headless (R1-R11): đạt, bằng chứng ở `docs/proof/phase1/results.md` (chạy `npm test`, 24/24).
- R12 (game có đồ họa, chơi lại được): đạt, bằng chứng `docs/proof/phase1/e2e-results.md` (`npm run e2e`, 7/7). Test điều khiển game thật trong Chrome headless bằng phím thật: đi, nhặt, nạp và thắp đèn, xoay camera, nhảy, pulse, màn thắng + nút Chơi lại, màn thua + phím R, màn tiêu đề. Ảnh trong `docs/proof/phase1/screens/e2e-*.png`.
- Hiệu năng: render 60.5 FPS trên Intel Iris Xe (GPU thật, 1280x720), frame tệ nhất 66.7 ms; mô phỏng headless khoảng 270k tick/s. Chưa kiểm tra: kéo chuột để xoay, phiên chơi dài, GPU khác, hiệu ứng vòng pulse chưa thấy rõ trong ảnh chụp (ảnh chụp sau 120 ms).
- R13 (README 3 lệnh): đã viết, chưa thử trên bản clone sạch.
- Đã kiểm tra bộ test thực sự bắt được lỗi: sửa tạm `invuln_s` và `per_mote` trong contract thì 2 case đỏ; đã khôi phục.
