# ADR-0001: mô hình nhiên liệu đèn và luật thắng "bình minh"

Trạng thái: chấp nhận (Phase 3, Ticket-03). Thay thế: luật "đèn đã sáng không nhận thêm đom đóm", "thắng ngay khi tất cả đèn sáng", "Bóng Mực không bao giờ vào vùng an toàn" và công thức điểm của Ticket-02.

## Bối cảnh

Playtest cho thấy người giỏi thắp hết đèn trong 2 phút rồi game kết thúc. Nhà thiết kế muốn đổi mục tiêu thành "giữ đảo sáng tới bình minh".

## Quyết định

1. **Đèn có nhiên liệu**, lưu bằng số nguyên theo đơn vị 1/60 (`fuelU`, tối đa 6000). Mỗi tick trừ `fuel_decay_per_s` (1 đơn vị) và `drain_per_s` (5 đơn vị) cho mỗi Bóng Mực đang `drain`. Lý do: ticket yêu cầu tính nguyên đơn vị 1/60 để tránh sai số số thực; chỉ làm tròn khi xuất snapshot (`fuel`, 1 chữ số).
2. **Trạng thái đèn** gồm `lit`, `fuelU`, `ever_lit`, `relit_count`, `deposited`. Hết dầu thì `lit = false`, `deposited = 0`, giữ `ever_lit`. Chi phí thắp lấy theo `ever_lit` (10 hoặc 5), không thêm trạng thái "tắt tạm".
3. **Một lệnh Tương tác, hai nghĩa**: chọn đèn gần nhất trong số đèn nhận được; đèn chưa sáng thì nạp (deposit), đèn sáng chưa đầy thì châm dầu (refuel). Vì mọi đèn sáng đều hao 1 đơn vị trước bước tương tác, đèn sáng gần như luôn "nhận được" ngay sau tick đầu.
4. **Vùng an toàn phụ thuộc dầu** (`lit && fuel ≥ 30`). Bóng Mực `wander` đi tới đèn sáng yếu gần nhất rồi `drain`; đèn yếu tự trở thành mục tiêu, tạo áp lực phải châm dầu. Khi dầu ≥ 30 lại, Bóng Mực trong vùng 6 m bị đẩy ra trong 30 tick và vô hại (dùng lại cơ chế `eject` của đèn mới thắp).
5. **Thắng ở bước 11 chỉ khi hết giờ**: còn sống và số đèn sáng ≥ `ceil(win_ratio × tổng)`. `no_flames` luôn ưu tiên. Điểm thưởng thời gian bỏ (`per_second_left` = 0 trong contract), thay bằng thưởng theo dầu từng đèn sáng.
6. **Sức chứa** là hàm của `successful_lights` (chỉ tính lần thắp, không tính châm dầu), tối đa 20, đặt lại mỗi Đêm.
7. **Hành vi `wander` đổi từ đi lang thang ngẫu nhiên sang đi tới đèn tắt gần nhất** khi không có đèn yếu. Ticket-03 viết "đi về đèn tắt gần nhất như trước", nên ta suy ra đây là hành vi nền; Phase 2 (giả định B5) đã làm khác (đi ngẫu nhiên). Đã sửa lại, và vẫn đi ngẫu nhiên khi không còn đèn tắt hay đèn yếu.

## Hệ quả

- Mọi test dựa vào "thắp hết là thắng" hoặc điểm cũ phải viết lại (xem `phase3-regression.md`).
- `game.contract.json` v1.2 thêm tuning và đổi thời lượng; khóa `score` mới có thêm `per_relight`, `per_stun_drain`, `per_lit_dawn` (ngoài các khóa ticket liệt kê, vì ticket không nêu tên khóa điểm).
- Rủi ro: tốc độ của `wander` hướng đèn (ta dùng `shade_speed` 4 m/s) và thứ tự ưu tiên giữa chuyển trạng thái `drain → chase` và `drain → wander` là giả định (C1, C11 trong `phase3-assumptions.md`).
