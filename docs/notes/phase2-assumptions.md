# Phase 2: giả định và tiêu chí nghiệm thu

Nguồn: [ticket-02.md](ticket-02.md). Các giả định Phase 1 (A1-A26 trong [phase1-assumptions.md](phase1-assumptions.md)) vẫn dùng, trừ khi bị mục dưới đây thay thế.

## Giả định mới (chỗ Ticket-02 chưa quy định)

| # | Chỗ mơ hồ | Giả định |
|---|---|---|
| B1 | Quy ước góc | Điểm bán kính r, góc θ: (x, z) = (r cos θ, r sin θ). Khớp tọa độ đèn trong ticket (ví dụ L2 ở 18°, dốc 30° và 150° nằm ở nửa z > 0) |
| B2 | Xuất phát Đêm 2, Đêm 3 | Đêm 2: (0,0,0) trên đảo A. Đêm 3: (0,0,-20) trên tầng 0 (tâm đảo nằm trong đĩa tầng 2). Quay mặt +Z. Hồi sinh sau khi rơi cũng ở điểm này |
| B3 | Tăng/giảm tốc "≤ 0.1 s" | Vận tốc ngang tiến tới vận tốc mục tiêu mỗi tick tối đa `tốc độ / 6` (đạt tốc độ đầy đủ sau đúng 6 tick), cả trên không. Sau khi lướt xong, vận tốc về `tốc độ chạy` theo hướng lướt |
| B4 | Bóng Mực `spawning` | Đứng yên 30 tick, vô hại, vẫn bị Tỏa Sáng ảnh hưởng. Sau đó `wander` (hoặc `chase` nếu Mây trong 12 m) |
| B5 | `wander` | Đi 2 m/s theo hướng ngẫu nhiên (RNG có seed), đổi hướng mỗi 60 tick hoặc khi gặp vật cản. `wander → chase` khi Mây trong 12 m (XZ), `chase → wander` khi xa hơn 18 m |
| B6 | `recoil` | Sau khi gây hit, bóng lùi 2 m (đều trong 60 tick) ngược hướng Mây, vô hại, rồi về `chase`. Bóng `wander` và `chase` đều gây hit khi chạm; `stunned`, `spawning`, `recoil` thì không |
| B7 | Hết choáng | Khi hết 120 tick choáng, bóng về `chase` nếu Mây trong 12 m, ngược lại `wander` |
| B8 | Độ cao Bóng Mực | `shade.pos` là tâm, cao hơn mặt đất 0.5 m. Chênh cao khi chạm tính giữa chân Mây và mặt đất dưới bóng |
| B9 | Bóng Mực và địa hình | Bóng đi theo địa hình như Mây (không leo vách cao hơn 0.5 m, không bước ra khoảng không, không xuyên tháp chuông), không có tìm đường |
| B10 | Điểm sinh | Chọn ngẫu nhiên (RNG có seed) trong các điểm hợp lệ (Bóng Mực: cách Mây ≥ 15 m ở mọi Đêm; đom đóm: điểm chưa có đom đóm ngẫu nhiên). 2 Bóng Mực sinh cùng tick dùng 2 điểm khác nhau. Trần 30 đom đóm tính cả đom đóm rơi |
| B11 | `random_motes` | `false` tắt cả 20 đom đóm đầu và lịch sinh thêm. Nếu có `motes` trong scenario thì thay 20 đom đóm đầu, lịch sinh thêm vẫn chạy nếu `random_motes` không phải `false`. Tương tự `random_shades`, `random_drifters` |
| B12 | Pulse trúng Bóng Mực đang choáng | Làm mới choáng 120 tick và đẩy lùi lại 4 m, cộng +5 (thay A20 của Phase 1) |
| B13 | Rơi khỏi đảo | Mây chỉ rơi thật khi mặt đất bên dưới không có (không còn rào vô hình, thay A6). Event `player_hit` `{by:"fall", flames, dropped, lost}`: `dropped` = số đom đóm mất hết (không rơi ra đất), `lost` = true nếu hết Ngọn Lửa |
| B14 | Thứ tự tick và thắng | Thắng/thua chỉ xét ở bước 11 (không thoát sớm ở bước tương tác như Phase 1). Đèn đã sáng sẵn trong scenario cho phép thắng ở tick 1 |
| B15 | `tick` và `sim_tick` | `tick` tăng mọi bước (kể cả khi tạm dừng); `sim_tick` chỉ tăng khi không tạm dừng; thời gian còn lại tính theo `sim_tick`. Lịch sinh dùng `sim_tick`. Sự kiện đóng dấu `tick` |
| B16 | `pause` | Chuyển false → true khi đang chơi thì tạm dừng, khi đang tạm dừng thì tiếp tục. Tick tiếp tục vẫn xử lý bình thường các bước sau bước 1 |
| B17 | `night_start` | Phát ở bước đầu tiên của lần chạy (tick 1) |
| B18 | Vùng an toàn bị đẩy | Bóng trong 6 m quanh đèn vừa thắp bị đẩy đều ra mép trong đúng 30 tick và đứng yên (không đuổi) lúc đó. Vùng an toàn chỉ chặn bóng đi vào từ ngoài |
| B19 | Gió mạnh | Cơn đầu bắt đầu ở `sim_tick` 1800, kéo dài 300 tick, mỗi 1800 tick một cơn, hướng ngẫu nhiên (độ, theo B1). Đẩy Mây 2 m/s cộng thêm vào dịch chuyển. Chỉ Đêm 3, tắt bằng `wind_enabled: false` |
| B20 | Chuyển tầng | Mây không bước lên được nếu mặt đất đích cao hơn chân quá 0.5 m (vách); bước ra mép thì rơi. Dốc đi được (độ dốc 0.5). Tháp chuông chặn khi chân thấp hơn 14 |
| B21 | Bục nhảy | Kích hoạt khi Mây đứng trên đất, cách tâm bục ≤ 1 m (XZ) và cao ≤ 0.5 m so với mặt bục; không kích hoạt lại cho tới khi chạm đất |
| B22 | Lướt | Hướng = hướng đang nhập (đã xoay theo camera) hoặc hướng quay mặt; ban đầu quay mặt +Z. Lướt thay vận tốc ngang trong 12 tick, không trọng lực |
| B23 | Gió Lạc | Chỉ cướp khi ở `chase`. Pulse trúng làm Gió Lạc `chase` → `flee` (không cướp); trúng lúc `flee` có mang thì thả toàn bộ ra thành đom đóm rơi (TTL 120 tick), Gió Lạc tiếp tục `flee` với `stolen: 0`. Gió Lạc `removed` vẫn nằm trong snapshot. Pulse trúng Gió Lạc không cộng điểm. Sinh ở điểm ngẫu nhiên trên đảo (cao 1.5 m so với đất) |
| B24 | Bùa Gió | Nhặt khi XZ ≤ 1.0 m và chênh cao ≤ 1.5 m. `respawn_s` đếm ngược từ 45 s khi `available: false` |
| B25 | Snapshot | `invuln` là boolean (còn bộ đếm bất tử > 0); `player.vel` là [vx, vy, vz]; `wind.dir_deg` là 0 khi không có gió; `ttl_s` là `null` với đom đóm ngẫu nhiên |
| B26 | Điểm tổng | Headless chỉ chạy một Đêm nên `score` là điểm của Đêm đó; tổng nhiều Đêm do game giữ |

## Tiêu chí nghiệm thu

| ID | Tiêu chí |
|---|---|
| S0 | Mọi giá trị `tuning` trong `game.contract.json` bằng số chuẩn của ticket; có đủ khóa mới |
| S1 | `--night 1/2/3` đúng bản đồ: vị trí đèn, đảo, cầu (xem ticket) |
| S2 | Dash: trong 12 tick di chuyển 14 m/s, hồi chiêu 90 tick tính từ lúc bắt đầu, nhấn lúc đang lướt bị bỏ qua, trên không giữ độ cao |
| S3 | Rơi khỏi đảo: -1 Ngọn Lửa, mất hết đom đóm, chờ 60 tick, hồi sinh ở điểm xuất phát bất tử 90 tick; hết Ngọn Lửa thì thua `no_flames` |
| S4 | Đom đóm: 20 lúc đầu, sinh thêm mỗi 240 tick tới trần 30; nhặt cần XZ ≤ 1.0 và chênh cao ≤ 1.5 |
| S5 | Đèn: nạp nhiều lần, nhớ tiến độ, chọn đèn gần nhất; +10 mỗi đom đóm nạp, +100 mỗi đèn |
| S6 | Vùng an toàn 6 m của đèn đã sáng: bóng không vào; bóng trong vùng được đẩy ra trong ≤ 30 tick, vô hại |
| S7 | Tỏa Sáng: cost 3, bán kính 3D 5 m từ chân + 0.8, choáng 120 tick, đẩy 4 m trong 15 tick, làm mới khi trúng lại, +5 mỗi lần mỗi con |
| S8 | Bóng Mực: lịch sinh (2 con ở tick 300 rồi theo chu kỳ từng Đêm, trần 6/8/10), tên trạng thái, phát hiện 12 và bỏ đuổi 18, tốc độ 4.0 (Đêm 3: 4.5) |
| S9 | Bị đánh: -1 Ngọn Lửa, rơi `floor(mang/2)` đom đóm (TTL 480), bất tử 90, tối đa 1 hit mỗi tick, bóng `recoil` |
| S10 | Thắng/thua: `no_flames` luôn thắng thế; thắng cả đúng tick hết giờ; `dawn`; điểm thưởng `floor(giây) × 2 + 50 × lửa` |
| S11 | Gió Lạc: sinh tick 1200/2400 (tối đa 2), `idle/chase/flee/removed`, cướp `min(3, mang)`, pulse làm nó bỏ chạy, thả lại đồ khi trúng lúc `flee` |
| S12 | Bùa Gió: nhặt, 600 tick, tốc độ 7.2, lướt không hồi chiêu, hồi sinh sau 2700 tick |
| S13 | Bục nhảy Đêm 2 và Đêm 3 đáp đúng vào đảo/tầng đích; vận tốc phóng giữ tới khi chạm đất |
| S14 | Đêm 3: vách chặn, dốc đi lên được, bước ra mép thì rơi xuống tầng dưới, tháp chuông chặn |
| S15 | Gió mạnh Đêm 3: đẩy 2 m/s khi `wind.active`, theo `dir_deg` |
| S16 | Tạm dừng: `tick` tăng, `sim_tick` và mọi bộ đếm đứng yên, snapshot `state: "paused"`; event `paused`/`resumed` |
| S17 | Snapshot, scenario, input, event theo Test Contract v1.1; tất định (cùng seed cho cùng output) |
| S18 | Hiệu năng: chạy headless một Đêm đầy đủ ≤ 30 giây; bản thường ≥ 30 FPS ở 1280×720 |
| S19 | Game: chuỗi 3 Đêm (menu, giới thiệu, chơi, kết quả, Bình Minh), tạm dừng, cài đặt lưu `localStorage`, âm thanh, HUD đầy đủ, bảng màu chuẩn, ánh sáng môi trường theo công thức |
| S20 | Regression Phase 1: các test cũ được tính lại theo số chuẩn (xem docs/proof/phase2) |

## Trạng thái (cuối Phase 2)

- Headless (S0-S17): đạt, `docs/proof/phase2/results.md` (`npm test`, 95/95). Giá trị mong đợi tính tay; bộ test đã được kiểm tra bằng đột biến (sửa tạm tuning trong contract thì 6 case đỏ; hai đột biến `pulse_radius` và `stepUp` ban đầu không bị bắt nên đã thêm case `pulse_radius_boundary`; `stepUp` vẫn chưa có case riêng vì cả ba bản đồ chỉ có vách cao 3 m và dốc).
- Hiệu năng (S18): một Đêm đầy đủ (21.600 tick) chạy headless khoảng 0.3 s (yêu cầu ≤ 30 s); render 60 FPS trên Intel Iris Xe thật ở 1280×720, cả 3 Đêm (`docs/proof/phase2/e2e-results.md`).
- Game (S19): `npm run e2e` 19/19 (menu, intro, chơi, nạp đèn, lướt, nhảy, Tỏa Sáng, tạm dừng, cài đặt lưu qua reload, rơi và hồi sinh, bục nhảy Đêm 2, Gió Lạc cướp, Bùa Gió, Đêm 3, thắng/thua/chơi lại, Bình Minh).
- **Chưa kiểm tra / chưa đạt:** âm thanh (không có thiết bị âm thanh trong trình duyệt test; mã đã viết, chưa nghe thử); kéo chuột để xoay camera; cảnh gió mạnh Đêm 3 đang thổi (mới kiểm bằng sim, hiển thị lá chưa chụp ảnh); màu theo bảng chuẩn chỉ kiểm bằng mắt, chưa đo sai lệch RGB; mũi tên chỉ đèn ngoài màn hình chưa có test tự động; mọi giả định B1-B26 chưa được đối chiếu với test ẩn.
- Ghi chú giải thích mục HUD "E — Nạp ánh sáng (x/10)": x là tiến độ đã nạp của đèn gần nhất (không phải số đom đóm đang mang). Ticket không nói rõ; đây là giả định B27.
