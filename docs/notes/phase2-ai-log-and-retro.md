# Phase 2: nhật ký dùng AI và retro

## Công cụ và harness

- Claude Code (model Sonnet 5.5) trong VS Code, cùng phiên với Phase 1.
- Harness cập nhật cho Phase 2: `CLAUDE.md` (lệnh, bố cục `src/sim` và `src/web`, mục "Lessons"), skill mới `.claude/skills/headless-scenario/SKILL.md` (cách viết case headless tính tay), `docs/notes/ticket-02.md` (bản chép số liệu để làm việc không phụ thuộc ảnh chụp). Không dùng hook hay MCP riêng.

## Trình tự và lời nhắc chính

| Bước | Lời nhắc chính (tóm tắt) | Kết quả |
|---|---|---|
| Đọc yêu cầu | Người dùng dán 9 ảnh chụp tab Phase 2 (trang lab tải nội dung lúc chạy nên công cụ đọc artifact không thấy) | Bản chép `ticket-02.md`, bảng khác biệt so với Phase 1, 9 giả định đề xuất |
| 0 | "lam theo plan" | `phase2-assumptions.md` (B1-B26, S0-S20), contract v1.1 |
| 1 | viết lại lõi mô phỏng | `maps.ts` (3 Đêm), `sim.ts` theo thứ tự tick 12 bước, scenario/inputs mới |
| 2 | test tính tay | 89 case + tất định 3 Đêm + thời gian một Đêm; 95/95 |
| 3 | game 3 Đêm | menu, intro, tạm dừng, cài đặt, âm thanh Web Audio, HUD, bảng màu chuẩn |
| 4 | e2e + FPS | 19 kiểm tra trên game thật, 60 FPS trên GPU thật |
| 5 | phát hành | ghi chú, commit, chạy lại trên commit sạch, tag `phase-2` |

## Token và chi phí

**Không đo được:** Claude Code không ghi lại số token trong phiên làm việc và trợ lý không đọc được `/cost` hay trang usage của tài khoản, nên **không có con số token/chi phí thật**; tôi không ước lượng con số cụ thể để tránh ghi sai bằng chứng. Nhận xét định tính: Phase 2 tốn nhiều token hơn Phase 1 (viết lại `sim.ts` và `main.ts` khoảng vài trăm dòng mỗi file, tệp test lớn, đọc ảnh). Cách tiết kiệm: chép số liệu một lần vào `ticket-02.md` rồi chỉ làm việc từ bản chép; làm headless và test trước đồ họa; sinh `cases.json` bằng script nhỏ thay vì gõ tay từng case; chỉ xem ảnh chụp ở vài mốc.

## Chỗ AI sai hoặc cần sửa

1. **Công cụ đọc artifact không lấy được tab Phase 2** (nội dung tải lúc chạy). Hai lần thử với `#p2` và `page: true` đều chỉ trả về Phase 1. Cách xử lý: yêu cầu người dùng dán ảnh/nội dung, không cố tìm đường vòng.
2. **Đoán sai tên file khi ghi đè**: công cụ ghi file từ chối ghi đè file chưa đọc, và lần chạy `npm run e2e` cũ vô tình ghi đè bằng chứng Phase 1 (`docs/proof/phase1/`). Đã khôi phục bằng `git checkout` và xóa 4 ảnh FAIL do lần chạy đó tạo; từ giờ mỗi phase có thư mục bằng chứng riêng và có mục "Lessons" trong `CLAUDE.md`.
3. **Case test tự mâu thuẫn với mặc định của game**: hai case Đêm 2 đi qua cầu tre đạp trúng Bùa Gió mặc định ở (35,0,0) nên đổi tốc độ và thời điểm rơi. Sửa case (`charms: []`), không sửa game. Ghi vào Lessons.
4. **Bộ test bắt đột biến chưa đủ**: đột biến `pulse_radius` 5 → 4.5 không làm case nào đỏ vì mọi bóng trong case nằm xa ngưỡng; thêm `pulse_radius_boundary`. Đột biến `stepUp` (độ cao bước lên tối đa) vẫn chưa bị bắt vì bản đồ chuẩn không có bậc từ 0.5 đến 1.2 m.
5. Các giá trị mong đợi được tính tay trước khi chạy (ví dụ tick rơi 72, tick hạ cánh 49, đáp xuống (0,6,6)); 92 trong 94 kiểm tra đạt ngay lần chạy đầu (sau đó thêm 1 case biên nên thành 95); 2 sai do lỗi thiết kế case (mục 3), không do lỗi của game.

## Đánh giá yêu cầu

| Yêu cầu | Trạng thái | Bằng chứng |
|---|---|---|
| Contract v1.1, 3 Đêm, số chuẩn | Đạt (theo giả định B1-B26) | `docs/proof/phase2/results.md` |
| Mỗi tính năng mới có scenario headless | Đạt | tên case trong `results.md` |
| Regression Phase 1 theo số chuẩn | Đạt, đã tính lại từng case | `docs/notes/phase2-regression.md` |
| Game: chuỗi 3 Đêm, tạm dừng, cài đặt lưu, HUD, bảng màu | Đạt (mắt thường) | `docs/proof/phase2/e2e-results.md`, `screens/` |
| ≥ 30 FPS ở 1280×720 | Đạt: 60 FPS (Iris Xe) | `e2e-results.md` |
| Âm thanh | Đã viết, **chưa nghe thử** | không có |
| Cập nhật harness | Đạt | `CLAUDE.md`, `.claude/skills/headless-scenario/` |

## Retro

**Tốt:** chép số liệu thành tài liệu trong repo trước khi code; tách `maps.ts`; test tính tay phát hiện được lỗi thiết kế case; kiểm tra đột biến chỉ ra chỗ test yếu; mỗi phase một thư mục bằng chứng.

**Chưa tốt:** chưa đo token; âm thanh chưa nghe thử; nhiều giả định ở chỗ ticket chưa rõ nhưng chưa có cách đối chiếu với người chấm; `main.ts` đã dài (nên tách HUD/scene ở Phase 3 nếu cần thêm).

**Cho Phase 3:** đọc `ticket-03` rồi làm ngay bản chép số liệu và bảng khác biệt như lần này; ghi token sau mỗi bước; thử nghe âm thanh trước khi tag; khi ticket đổi số chuẩn thì sửa `game.contract.json` và `cases.json` cùng lúc rồi chạy kiểm tra đột biến.
