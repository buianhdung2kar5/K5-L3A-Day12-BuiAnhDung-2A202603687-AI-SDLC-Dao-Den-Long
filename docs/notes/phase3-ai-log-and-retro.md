# Phase 3: nhật ký dùng AI và retro

## Công cụ và harness

- Claude Code (model Sonnet 5.5) trong VS Code, cùng phiên với Phase 1-2.
- Harness cập nhật: `CLAUDE.md` (trạng thái Phase 3, bài học về nhiên liệu nguyên đơn vị 1/60, `cases.json` được sinh từ `tests/gen_cases.py`, đường dẫn bằng chứng từng phase), skill `.claude/skills/headless-scenario/SKILL.md` (sửa cho quy trình sinh case), `docs/notes/ticket-03.md` (bản chép số liệu), ADR và CHANGELOG theo yêu cầu DoD.

## Trình tự và lời nhắc chính

| Bước | Lời nhắc chính (tóm tắt) | Kết quả |
|---|---|---|
| Đọc yêu cầu | Người dùng dán 6 ảnh chụp tab Phase 3 ("đã có phase 3") | `ticket-03.md`, danh sách luật bị thay thế |
| Giữa chừng | Người dùng yêu cầu thêm: chỉnh UI đẹp hơn, đổi nhân vật sang Songoku và hồn ma Gotenks (Dragon Ball) | UI làm lại; **không** dùng nhân vật Dragon Ball (RULES.md mục 8: nhân vật/thương hiệu phải là bản gốc) |
| Mô phỏng | thêm nhiên liệu, `drain`, luật thắng bình minh, sức chứa, điểm mới | `sim.ts` patch bằng script, contract v1.2 |
| Test | 27 case mới tính tay + sửa 13 case cũ có lý do | 122/122; đột biến 6 tuning → 12 case đỏ |
| Game + e2e | thanh dầu, nhấp nháy, đèn xẹp, mù màu, HUD, UI mới | e2e 24/24, FPS ≥ 30 trên GPU thật |
| Phát hành | ADR, changelog, ghi chú, commit, tag | xem README |

## Token và chi phí

Chưa đo được: phiên này không ghi lại số token. **Điền số thật từ `/cost` hoặc trang usage trước khi nộp.** Nhận xét định tính: Phase 3 gọn hơn Phase 2 vì ticket thay luật chứ không thêm bản đồ; cách tiết kiệm là patch `sim.ts` bằng script có kiểm tra khớp chuỗi (mỗi chỗ sửa assert tồn tại) thay vì viết lại, và sinh test từ một file Python.

## Chỗ AI sai hoặc cần sửa

1. **Lệnh shell dài với heredoc bị lỗi cú pháp** (`unexpected EOF`), và lệnh khác quá dài (`ENAMETOOLONG`) ở Phase 2. Cách xử lý: ghi script ra file bằng công cụ Write rồi chạy.
2. **Đường dẫn bằng chứng viết cứng trong test runner**: lần sửa bằng `sed` đổi "docs/proof/phase2" không khớp vì đường dẫn được ghép bằng `join(root, "docs", "proof", "phase2")`, nên lần chạy đầu của Phase 3 ghi đè bằng chứng Phase 2 (đang được commit). Đã `git checkout` khôi phục, sửa đúng chuỗi và ghi vào mục Lessons.
3. **Giả định sai từ Phase 2 lộ ra nhờ ticket mới**: ticket nói "đi về đèn tắt gần nhất như trước", nghĩa là `wander` nền vốn đi về đèn tắt, còn Phase 2 làm đi lang thang ngẫu nhiên. Đã sửa (giả định C1) và ghi trong ADR.
4. **Đèn sáng luôn bị hao một đơn vị trước bước tương tác**, nên case cũ "bỏ qua đèn sáng khi chọn" không còn đúng (đèn sáng gần như luôn nhận được dầu). Viết lại case thành `refuel_nearest_not_full_lantern`.
5. 122/122 đạt ngay lần chạy đầu sau khi sửa 13 case cũ; giá trị mong đợi của 27 case mới được tính tay trước (ví dụ drain bắt đầu ở tick 45, `fuel_drain` ở tick 105 với 13.3).

## Yêu cầu bị từ chối

Người dùng đề nghị dùng Songoku làm nhân vật và hồn ma của hợp thể Gotenks (Dragon Ball) làm Bóng Mực. RULES.md mục 8 yêu cầu nhân vật, bối cảnh và tên gọi phải là bản gốc của lab, không dùng nhân vật/mô hình/thương hiệu của game hay phim có sẵn; vi phạm có thể bị trừ điểm hoặc coi là vi phạm bản quyền. Giữ Mây (người giữ đèn đội nón chóp) và Bóng Mực, thêm mắt cho Bóng Mực và làm lại giao diện. Nếu muốn nhân vật dễ thương hơn, có thể thiết kế một nhân vật gốc (ví dụ thêm tóc, khăn, mặt cười) mà không bắt chước Dragon Ball.

## Đánh giá yêu cầu

| Yêu cầu | Trạng thái | Bằng chứng |
|---|---|---|
| Nhiên liệu, thắp lại, châm dầu, hết dầu | Đạt (theo C1-C15) | `docs/proof/phase3/results.md` |
| Bóng Mực hút dầu, mất vùng an toàn, đẩy ra | Đạt (theo C1-C3, C11) | `results.md` |
| Luật thắng bình minh, ngưỡng, thời lượng | Đạt | `results.md`, `e2e-results.md` |
| Sức chứa tăng dần, điểm mới | Đạt | `results.md` |
| Bảng màu dễ phân biệt, đèn tắt xẹp/vết rách, nhấp nháy | Đạt (nhìn bằng mắt; không đo tần số nhấp nháy) | `screens/` |
| ADR, changelog, test cũ cập nhật có lý do | Đạt | `adr-0001-*.md`, `CHANGELOG.md`, `phase3-assumptions.md` |
| Âm thanh | Đã viết (Phase 2), **chưa nghe thử** | không có |

## Retro

**Tốt:** patch có assert khớp chuỗi; test tính tay lại bắt đúng 13 chỗ luật cũ bị đổi; đột biến tuning bắt được 12 case; ADR ghi rõ chỗ ta sửa giả định cũ.

**Chưa tốt:** vẫn chưa đo token; vết rách giấy chỉ là vài thanh mảnh; giả định về tốc độ `wander` có thể lệch test ẩn.

**Cho Phase 4:** ghi token sau mỗi bước; sửa đường dẫn bằng chứng ngay khi bắt đầu phase (đã thêm vào Lessons); thử nghe âm thanh một lần trước khi phát hành; chuẩn bị video demo sớm.
