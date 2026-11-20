# Phase 4: giả định, tiêu chí nghiệm thu và trạng thái

Nguồn: [ticket-04.md](ticket-04.md). Giả định các phase trước vẫn dùng.

## Giả định (chỗ Ticket-04 chưa quy định)

| # | Chỗ mơ hồ | Giả định |
|---|---|---|
| D1 | `bench_cmd` cho một game web | `node scripts/bench.mjs`: mở server của game, chạy Chrome/Chromium bằng puppeteer-core (cần cài Chrome hoặc đặt `CHROME_PATH`), cửa sổ 1280×720 không toàn màn hình, headless mặc định (`--headed` để hiện cửa sổ) |
| D2 | Tắt vsync | Chrome gắn `requestAnimationFrame` với tần số quét màn hình, và khi mở khóa (`--disable-frame-rate-limit`) thì cứ mỗi 0.5 s lại có một cú đứng khoảng 200 ms (đo thật: p1_low khoảng 5 fps). Vì vậy cảnh bench **không** dùng rAF: vòng lặp chạy bằng `MessageChannel`, mỗi khung gọi `gl.finish()` nên thời gian đo là thời gian render thật. Chrome vẫn gắn cờ `--disable-gpu-vsync --disable-frame-rate-limit`. Báo `vsync_off: true` |
| D3 | `load_ms` | Từ lúc tiến trình `bench.mjs` bắt đầu (gồm khởi động trình duyệt, tải trang, biên dịch shader) tới khung hình đầu tiên của cảnh bench |
| D4 | `peak_mem_mb` cho bản web | Working set của cả cây tiến trình Chrome, lấy mẫu 3 lần ngay sau khoảng đo trong lúc cảnh vẫn chạy (xấp xỉ đỉnh); thêm `peak_js_heap_mb` (đỉnh bộ nhớ heap JS trong lúc đo) và ghi chú `peak_mem_note` trong JSON |
| D5 | `frame_ms_p95` | Phân vị 95 theo "nearest rank" trên `dt` đã sắp xếp tăng dần |
| D6 | Khởi động 3 s | Tính từ khung hình đầu tiên của cảnh bench; sau 3 s thu đúng `--duration` giây |
| D7 | Cảnh bench | Đêm 1; 200 Bóng Mực `wander` và 100 đom đóm phân bố đều theo diện tích trong bán kính 38 m (seed), cách Mây ≥ 3 m và cách L1-L3 ≥ 7 m; cờ `bench: true` trong scenario tắt sinh thêm, sát thương, nhặt, hao dầu, kết thúc Đêm và việc `wander → chase`. Theo luật Ticket-03 bóng `wander` đi tới đèn tắt gần nhất (L4/L5) nên theo thời gian chúng dồn về hai đèn đó |
| D8 | Soak: đánh số `i` | `i` chạy từ 0 đến 9, seed `7 + i`, loại Đêm `(i % 3) + 1` |
| D9 | Soak: "tải xong" và "reset" | Giai đoạn tải gồm khởi động JIT (3 Đêm chạy thử bỏ đi, mỗi Đêm 1500 tick), rồi dựng Đêm đầu tiên và đo `mem_start_mb`; "reset" là bỏ tham chiếu Đêm cuối rồi thu gom rác; RSS lấy từ `process.memoryUsage().rss` sau khi buộc GC. Input ngẫu nhiên: cứ 30 tick chọn hướng mới (15% đứng yên), góc camera 0; mỗi tick 5% nhảy, 3% lướt, 2% tỏa sáng, 10% tương tác |
| D10 | Kết quả soak | `results[i]` là `won` hoặc `lost` (game luôn kết thúc ở bình minh nên không có kết quả "dở dang") |
| D11 | Nơi lưu bảng xếp hạng | Server của game (`node scripts/serve.mjs`) lưu ở `data/leaderboard.json` (đổi bằng biến môi trường `LEADERBOARD_PATH`), ghi nguyên tử. Bản web tĩnh không có server thì dùng `localStorage` của trình duyệt. `--export-leaderboard out.json` xuất file của server |
| D12 | Điểm lưu | Tổng điểm các Đêm đã thắng trong lượt chơi hiện tại; được mời lưu sau khi thua ở bất kỳ Đêm nào (nút "Lưu điểm") và ở màn Bình Minh; sau khi lưu thì bắt đầu lượt mới. Điểm ngoài top 10 không được lưu (báo "chưa vào top 10") |
| D13 | Tên | 3-12 ký tự gồm chữ cái (có cả chữ tiếng Việt có dấu), chữ số và `_` |
| D14 | `achieved_at` | ISO 8601 theo UTC, có hậu tố `Z` |
| D15 | Đổi phím | 9 hành động (đi 4 hướng, nhảy, lướt, tương tác, tỏa sáng, tạm dừng). Phím dành riêng: mũi tên trái/phải (xoay camera) và R (chơi lại Đêm). Phím trùng bị từ chối kèm thông báo; mũi tên lên/xuống không còn điều khiển di chuyển. Lưu trong `localStorage` |
| D16 | Phụ đề / chỉ báo | Luôn bật: thông báo chữ có hướng ("bên phải", "phía sau"…) và mũi tên ở mép màn hình trong 4 s khi Bóng Mực xuất hiện; thông báo gió sắp thổi; số đếm lớn 10 s cuối; thông báo đèn dưới 30 dầu và đèn tắt |
| D17 | Giảm chuyển động | Tắt rung camera khi bị đánh, chớp màn hình, và các hoạt ảnh CSS trang trí |
| D18 | Cỡ chữ | Gốc 18 px; chữ lớn là 22.5 px (×1.25); mọi đơn vị trong CSS là rem. Có test quét kích cỡ chữ tính toán của mọi phần tử đang hiển thị ở menu, cài đặt, HUD |
| D19 | Gói phát hành | File zip thư mục web tĩnh kèm server Node không phụ thuộc gói ngoài (`node scripts/serve.mjs`), kèm hướng dẫn |

## Tiêu chí nghiệm thu

| ID | Tiêu chí |
|---|---|
| U1 | `bench_cmd` chạy đúng cảnh chuẩn, thoát mã 0 và ghi `bench.json` đủ trường; `frames` và `avg_fps` nhất quán với thời gian đo; cờ `bench` tắt gameplay |
| U2 | `soak_cmd` chạy 10 Đêm trong một tiến trình, `crashes = 0`, `mem_end_mb ≤ 1.2 × mem_start_mb`, tất định theo seed |
| U3 | Bảng xếp hạng: top 10, sắp xếp, hòa điểm, tên hợp lệ, ISO 8601, lưu qua khởi động lại, màn hình trong menu, xuất đúng thứ tự |
| U4 | Dễ tiếp cận: đổi phím (trùng, khôi phục, lưu), chỉ báo hình ảnh, giảm chuyển động, chữ ≥ 18 px và chữ lớn |
| U5 | Đóng gói: 3 lệnh, README đầy đủ, CHANGELOG 4 phase, CREDITS, LICENSE, Release `v1.0.0` |
| U6 | Retro 1-2 trang và video demo dưới 5 phút |

## Trạng thái

Xem `docs/proof/phase4/` (`results.md`, `e2e-results.md`), `bench.json`, `soak.json` ở thư mục gốc, và [retro.md](retro.md).

**Chưa kiểm tra / chưa đạt:**
- Ngưỡng bench `avg_fps ≥ 60`, `p1_low_fps ≥ 30`, `load_ms ≤ 10000` chỉ được đo trên máy của tôi (xem `bench.json`); máy chấm có thể khác.
- Bench bản web cần Chrome/Chromium trên máy chấm; nếu thiếu, lệnh thoát với mã 1 và thông báo rõ.
- Video demo do script tự chơi và ghi lại (không phải người chơi trực tiếp).
- Âm thanh vẫn chưa được nghe thử trong môi trường kiểm thử.
- Cách đo `peak_mem_mb` là xấp xỉ (3 mẫu sau khoảng đo).
