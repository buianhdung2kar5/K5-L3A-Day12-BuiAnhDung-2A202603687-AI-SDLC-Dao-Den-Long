# Retro tổng kết 4 phase (Đảo Đèn Lồng, v1.0.0)

## 1. Đánh giá (Evaluation) từng phase

| Phase | Yêu cầu | Kết quả tự đánh giá | Bằng chứng |
|---|---|---|---|
| 1: PRD-0 | Đêm 1, Test Contract v1.0 | Đạt: lõi mô phỏng tất định, headless, game chơi được | `docs/proof/phase1/`, 24 case + 7 e2e |
| 2: Ba hòn đảo | 3 Đêm, số chuẩn, contract v1.1 | Đạt theo 26 giả định; âm thanh viết nhưng chưa nghe thử | `docs/proof/phase2/`, 95 + 19 |
| 3: Đèn cạn dầu | thay luật cốt lõi (dầu, hút dầu, thắng ở bình minh), contract v1.2 | Đạt theo 15 giả định; sửa một giả định sai của Phase 2 (`wander`) | `docs/proof/phase3/`, 122 + 24 |
| 4: Bình minh | bench, soak, bảng xếp hạng, dễ tiếp cận, phát hành | Đạt trên máy của tôi (bench, soak, 129 + 31 kiểm tra); ngưỡng chính thức chỉ biết trên máy chấm | `docs/proof/phase4/`, `bench.json`, `soak.json`, Release `v1.0.0` |

Điểm yếu còn lại, ghi thẳng: toàn bộ giá trị trong `tuning` và các chỗ ticket chưa quy định là **giả định của tôi** (B1-B26, C1-C15, D1-D19) chưa được đối chiếu với test ẩn; âm thanh chưa nghe thử; video demo do script tự chơi (không phải người chơi); số bench chỉ đo trên một máy (i7-12700H, Intel Iris Xe); token chưa đo (xem mục 5).

## 2. Điều gì hiệu quả khi làm với AI

- **Kiểm chứng trước, đồ họa sau.** Tách `src/sim` thuần logic và có chế độ headless từ Phase 1 nên mỗi ticket mới chỉ phải sửa một nơi, và test chạy trong vài giây.
- **Giá trị mong đợi tính tay.** Mỗi case có công thức trong `why` (ví dụ tick rơi khỏi đảo là 72, drain bắt đầu ở tick 45). 122/122 case Phase 3 đạt ngay lần chạy đầu sau khi sửa 13 case cũ, nên khi có case đỏ thì đó là lỗi thật của một bên (code hoặc phép tính), không phải sao chép đầu ra.
- **Kiểm tra đột biến.** Sửa tạm một giá trị tuning rồi xem test có đỏ không; việc này lộ ra case `pulse_radius` yếu ở Phase 2.
- **Chép số liệu ticket thành tài liệu trong repo** (`ticket-0N.md`) trước khi code, kèm bảng khác biệt so với phase trước.
- **Chạy game thật bằng phím thật** (puppeteer) bắt được những lỗi mà test headless không thấy: thiếu favicon, test phụ thuộc thời gian thực, nền tảng đứng hình 200 ms khi mở khóa `requestAnimationFrame`.

## 3. Điều gì không hiệu quả

- **Lệnh shell dài và heredoc nhiều dấu nháy** thường lỗi cú pháp; cách chữa là ghi script ra file rồi chạy.
- **Giả định đoán trước khi có ticket sau**: giả định `wander` ngẫu nhiên ở Phase 2 sai so với Phase 3; các giả định tăng tốc và bốn trạng thái Bóng Mực cũng có thể lệch.
- **Đo benchmark qua `requestAnimationFrame`** cho kết quả vô nghĩa (p1_low khoảng 5 fps) vì Chrome không cấp phát khung đều khi mở khóa tần số; phải đổi cách đo.
- **Không đo token từ đầu**, nên không có số liệu để tối ưu.

## 4. Những lần AI sai và cách phát hiện

| Lần | Sai gì | Phát hiện bằng | Cách sửa |
|---|---|---|---|
| Phase 1-2 | e2e cũ ghi đè bằng chứng của phase trước; lệnh `taskkill` toàn bộ node | `git status` thấy file đổi; hệ thống chặn lệnh | `git checkout`; mỗi phase một thư mục bằng chứng; chỉ tắt đúng PID |
| Phase 2 | Test đi qua Bùa Gió mặc định nên đổi tốc độ | 2 case đỏ ngoài dự kiến | sửa case (`charms: []`), không sửa game |
| Phase 3 | `sed` đổi đường dẫn không khớp nên ghi đè bằng chứng Phase 2 | `git status` | khôi phục và sửa đúng chuỗi |
| Phase 3 | Giả định `wander` của Phase 2 | đọc kỹ ticket ("như trước") | sửa mô phỏng, ghi ADR |
| Phase 4 | Benchmark qua rAF có cú đứng 200 ms | p1_low = 5 fps dù avg 200 fps; in 25 khung chậm nhất cho thấy chu kỳ đều | vòng lặp `MessageChannel` + `gl.finish()` |
| Phase 4 | Soak: RSS cuối cao hơn đầu 21% (JIT/heap chưa ấm) | chạy 3 lần: 42,2 → 50,5-51 MB | thêm giai đoạn khởi động JIT trong bước "tải", buộc GC |
| Phase 4 | Test hiệu ứng chớp màn hình bắt trượt | quan sát log: bộ quan sát gắn sau sự kiện chớp | gắn `MutationObserver` ngay từ đầu tài liệu |
| Phase 3 | Yêu cầu dùng nhân vật Dragon Ball | đọc RULES.md mục 8 | từ chối, giữ nhân vật gốc |

## 5. Harness giúp nhiều nhất, token và chi phí

- **Hiệu quả nhất:** `CLAUDE.md` với mục "Lessons" (mỗi lỗi lặp lại được ghi một dòng) và skill `headless-scenario` (cách viết case tính tay). Hook chưa dùng.
- **Token/chi phí:** **Không đo được:** Claude Code không ghi lại số token trong phiên làm việc và trợ lý không đọc được `/cost` hay trang usage của tài khoản, nên **không có con số token/chi phí thật**; tôi không ước lượng con số cụ thể để tránh ghi sai bằng chứng. Nhận xét định tính (không phải số đo): cả bốn phase dùng chung một phiên dài, ngữ cảnh lớn do nhiều tệp mã và ảnh chụp; Phase 2 và 4 tốn nhất (viết lại `sim.ts`, `main.ts`, test lớn, đọc ảnh chụp); Phase 3 gọn nhất vì chỉ sửa luật.
- **Cách tiết kiệm đã dùng:** chép ticket một lần rồi làm việc từ bản chép; sửa mã bằng script có assert khớp chuỗi thay vì viết lại tệp; sinh test từ một file Python; kiểm chứng bằng headless (rẻ) trước khi chạy trình duyệt (đắt); chỉ xem ảnh chụp ở vài mốc; không dùng subagent.

## 6. Nếu làm lại

1. Ghi token sau mỗi bước ngay từ phút đầu.
2. Viết bản đồ giả định và gửi hỏi giảng viên/trợ giảng sớm cho những chỗ có nhiều khả năng bị chấm (tốc độ `wander`, vị trí xuất phát, thứ tự chuyển trạng thái).
3. Đưa benchmark và soak vào từ Phase 2 để phát hiện sớm vấn đề hiệu năng (thin instances ngay từ đầu).
4. Quay video demo bằng người chơi thật và nghe thử âm thanh trước khi phát hành.
5. Tách `main.ts` (hơn 1000 dòng) thành các mô-đun HUD, màn hình, cảnh.
