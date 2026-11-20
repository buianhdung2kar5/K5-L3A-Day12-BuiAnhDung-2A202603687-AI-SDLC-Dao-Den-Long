# Phase 1: nhật ký dùng AI và retro

## Công cụ và harness

- Claude Code (model Sonnet 5.5) trong VS Code, một phiên liên tục cho cả Phase 1.
- Harness: `CLAUDE.md` (tạo bằng `/init` ở đầu phiên, cập nhật sau mỗi bước: lệnh build/test/headless, quy ước tách `src/sim`, quy tắc "giá trị mong đợi tính tay"). Không dùng skill, hook hay MCP riêng cho dự án.
- Trợ giảng trên lab board: chưa dùng. Yêu cầu Phase 1 được đọc trực tiếp từ tab Phase 1.

## Trình tự và lời nhắc chính

| Bước | Lời nhắc chính (tóm tắt) | Kết quả |
|---|---|---|
| 0 | "đọc phase 1 và lên plan"; chọn Babylon.js thay Three.js | Kế hoạch 6 bước; `game.contract.json`; 26 giả định + 13 tiêu chí (R1-R13) |
| 1 | "làm Bước 1" | Lõi mô phỏng `src/sim`, headless CLI; smoke test tay (tất định, mã thoát 2) |
| 2 | "làm Bước 2" | 24 case tính tay + runner; kiểm tra đột biến (sửa tạm contract thì test đỏ) |
| 3 | "làm Bước 3" | Game Babylon.js, HUD, màn thắng/thua, build web, server tĩnh |
| 4 | "làm Bước 4" | e2e bằng phím thật (7 test), đo FPS và tick/s |
| 5 | "làm Bước 5" | Ghi chú này, LICENSE, commit, tag |

## Token và chi phí

**Không đo được:** Claude Code không ghi lại số token trong phiên làm việc và trợ lý không đọc được `/cost` hay trang usage của tài khoản, nên **không có con số token/chi phí thật**; tôi không ước lượng con số cụ thể để tránh ghi sai bằng chứng. Nhận xét định tính:

- Nhiều token nhất: viết `sim.ts`, `main.ts`, `cases.json`, `e2e.mjs` (mỗi file vài trăm dòng) và đọc ảnh chụp.
- Cách tiết kiệm đã dùng: đọc yêu cầu một lần (lưu bản tóm tắt), đặt toàn bộ tuning ở một file, kiểm chứng sớm bằng headless (rẻ) trước khi dựng đồ họa, chỉ xem ảnh chụp ở những mốc cần thiết (4 ảnh), không chạy agent phụ.

## Chỗ AI sai hoặc cần sửa

1. **Test e2e xoay camera dựa vào thời gian** (giữ phím 0.75 s). Khi render phần mềm chỉ 4 FPS, game chạy chậm hơn thời gian thực nên test sai. Sửa: chờ theo trạng thái (`yaw >= 85`) thay vì ngủ cố định.
2. **Thiếu favicon** làm console báo 404 và test e2e đầu tiên đỏ. Sửa bằng favicon rỗng.
3. **Lệnh tắt toàn bộ tiến trình node** do AI tự đề xuất đã bị hệ thống chặn (quá rộng, có thể giết tiến trình khác). Sửa: chỉ tắt đúng PID của server.
4. **Số đo FPS lần đầu sai ngữ cảnh** (render phần mềm). Sửa: tách trình duyệt đo hiệu năng dùng GPU thật, và ghi tên renderer vào báo cáo.
5. Test lần đầu đều qua ngay, nên đã làm kiểm tra đột biến để chắc test không "luôn đạt".

## Đánh giá yêu cầu

| Yêu cầu | Trạng thái | Bằng chứng |
|---|---|---|
| Headless theo Test Contract (R1-R11) | Đạt | `docs/proof/phase1/results.md`, 24/24 |
| Game chơi được, thắng/thua/chơi lại (R12) | Đạt | `docs/proof/phase1/e2e-results.md`, 7/7 |
| README cài và chạy trong 3 lệnh (R13) | Đã viết; thử lại trên bản clone sạch trước khi tag | xem mục dưới |
| `tuning` khớp game | Đạt (giá trị đọc trực tiếp từ contract) | `src/sim/tuning.ts` |

Chưa đạt hoặc chưa kiểm tra: kéo chuột xoay camera, phiên chơi dài, GPU khác. Chưa xác minh được giá trị `tuning` có khớp kỳ vọng ẩn của người chấm hay không (PRD không cho số cụ thể; mọi giá trị là giả định, xem `phase1-assumptions.md`).

## Retro

**Tốt:** tách `src/sim` khỏi hiển thị ngay từ đầu nên headless, test và game dùng chung một logic; kiểm chứng trước đồ họa; giá trị mong đợi tính tay.

**Chưa tốt:** không đo token từ đầu; test thời gian thực dễ sai khi máy chậm; vòng pulse trên màn hình chưa được kiểm chứng bằng ảnh rõ ràng.

**Cho Phase 2:** mở `phase1-assumptions.md` và `cases.json` trước khi sửa, vì ticket có thể làm đổi giả định. Khi đổi luật, sửa `cases.json` kèm lý do thay vì tắt test. Ghi số token sau mỗi bước. Nếu thêm trường vào contract, cập nhật `game.contract.json` và `Tuning` cùng lúc.

## Ghi chú nộp bài

Bằng chứng trong `docs/proof/phase1/` được sinh ở commit ghi trong từng file; commit đánh tag chỉ thêm thư mục bằng chứng đó, mã nguồn giống hệt. Tên repo trên GitHub còn khác quy ước `K5-L3A-DAY12-<HoVaTen>-<MSSV>-AI-SDLC-Dao-Den-Long` (cần đổi trong Settings).
