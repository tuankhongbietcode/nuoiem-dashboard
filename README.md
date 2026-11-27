# Nuôi Em · bảng điều khiển minh bạch tài chính — bản demo tĩnh

Demo chạy được trên GitHub Pages: <https://tuankhongbietcode.github.io/nuoiem-dashboard/>

Đây là **bản tĩnh** của bảng điều khiển Topic 4 (COS40005 Project A). Trang chủ
là bảng tra cứu công khai, `/admin.html` là bảng điều khiển cho nhân viên quỹ.

## Số liệu trong demo không phải số liệu thật

Toàn bộ số trong demo lấy từ `du_lieu_mau/sao_ke_mau.csv` — 20 giao dịch **giả
lập**, dựng đúng cấu trúc sao kê của Quỹ nhưng mọi mã NE, số tiền và nội dung
chuyển khoản đều tự đặt. Không có một dòng nào từ sao kê thật.

Sao kê thật (238.173 dòng, 2018–2026) và database sinh ra từ nó **không** nằm
trong repo này, cũng không nằm trong bất kỳ repo công khai nào: file đó có
tên, số điện thoại và email của nhà tài trợ.

## Vì sao phải làm bản tĩnh

GitHub Pages chỉ phục vụ file tĩnh — không chạy Python, không có SQLite. Bản gốc
là một server `http.server` đọc SQLite. Nên bản này được xuất ra như sau:

1. Chạy `app.py` với database dựng từ file mẫu.
2. Gọi trước 163 URL mà giao diện có thể gọi (mọi tổ hợp lọc, mọi mã NE trong
   dữ liệu mẫu, mọi giao dịch), lưu kết quả thành `api/*.json`.
3. `demo-shim.js` thay `window.fetch`: khi trang gọi `/api/...`, nó đọc file
   JSON tương ứng thay vì gọi server.

Nên đây là **ảnh chụp**, không phải bản chạy thật: tra được 15 mã có trong dữ
liệu mẫu, lọc và sắp xếp được, nhưng không ghi được gì và không có mã nào khác.

## Bản đầy đủ

Code server, parser, bộ test và script đối soát nằm trong repo nhóm:
<https://github.com/kyoya156/QTT-transparency-and-blockchain/tree/main/dashboard>

Chạy bản đầy đủ thì cần sao kê gốc, và cần chạy bằng Python chứ không phải
GitHub Pages.
