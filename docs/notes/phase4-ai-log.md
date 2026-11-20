# Phase 4: nhật ký dùng AI

Retro tổng kết 4 phase: [retro.md](retro.md). Giả định và trạng thái: [phase4-assumptions.md](phase4-assumptions.md).

## Công cụ và harness

Claude Code (model Sonnet 5.5) trong VS Code, cùng phiên với Phase 1-3. Harness: `CLAUDE.md` (cập nhật lệnh bench/soak/package, bài học về `requestAnimationFrame` và thin instances), skill `.claude/skills/headless-scenario/SKILL.md`, `docs/notes/ticket-04.md`.

## Trình tự và lời nhắc chính

| Bước | Lời nhắc chính (tóm tắt) | Kết quả |
|---|---|---|
| Đọc yêu cầu | Người dùng dán 7 ảnh chụp tab Phase 4 | `ticket-04.md`, bảng giả định D1-D19 |
| Soak | thêm `src/soak.ts` | 10 Đêm một tiến trình; sửa mem_end/mem_start (khởi động JIT) |
| Bảng xếp hạng | server lưu đĩa + giao diện | `scripts/server.mjs`, API, `--export-leaderboard` |
| Benchmark | cảnh chuẩn + `scripts/bench.mjs` | thin instances cho Bóng Mực; đổi vòng lặp khỏi rAF (cú đứng 200 ms) |
| Dễ tiếp cận | đổi phím, chỉ báo, giảm chuyển động, chữ lớn | CSS sang rem; 18 px tối thiểu; test quét cỡ chữ |
| Phát hành | zip web tĩnh, README, retro, video | Release `v1.0.0` |

## Token và chi phí

**Không đo được:** Claude Code không ghi lại số token trong phiên làm việc và trợ lý không đọc được `/cost` hay trang usage của tài khoản, nên **không có con số token/chi phí thật**; tôi không ước lượng con số cụ thể để tránh ghi sai bằng chứng. Nhận xét định tính xem `retro.md` mục 5.

## Chỗ AI sai hoặc cần sửa

1. **Đo benchmark qua rAF cho số vô nghĩa** (avg 200 fps nhưng p1_low khoảng 5 fps): in ra 25 khung chậm nhất cho thấy cú đứng 200 ms đều đặn mỗi 84 khung. Thử headed, tắt compositing GPU, đổi backend ANGLE đều không hết; đổi sang vòng lặp `MessageChannel` + `gl.finish()` thì p1_low khoảng 84 fps.
2. **Soak lần đầu có RSS cuối cao hơn đầu 21%** (ngưỡng 20%) vì JIT chưa ấm: thêm khởi động JIT trong giai đoạn "tải" và buộc GC trước khi đọc RSS.
3. **Test chớp màn hình** bắt trượt vì gắn bộ quan sát sau khi sự kiện đã xảy ra (game chạy trước `DOMContentLoaded`); gắn `MutationObserver` ngay từ đầu tài liệu.
4. **Test khởi động lại server** gặp cổng cũ chưa giải phóng nên server mới nhảy sang cổng khác; đợi sự kiện `exit` của tiến trình cũ trước khi chạy lại.
5. **Lỗi cú pháp shell** với heredoc dài (hai lần); chữa bằng cách ghi script ra tệp rồi chạy.
6. **e2e có lúc rớt do `page.goto` quá 30 s** dưới render phần mềm; tăng timeout điều hướng lên 120 s.

## Đánh giá yêu cầu

Xem bảng ở [phase4-assumptions.md](phase4-assumptions.md) và [retro.md](retro.md). Chưa kiểm tra hoặc chưa đạt: ngưỡng bench trên máy chấm, âm thanh, video do người chơi thật, `peak_mem_mb` mới là xấp xỉ.
