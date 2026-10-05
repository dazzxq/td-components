import './td-timeline.js';
import '../styles/story-layout.css';

export default {
  title: 'Display/Timeline',
  tags: ['autodocs'],
};

/* td-timeline is an inline-size container: it takes its width from the parent (no shrink-to-fit wrapper). */
const H = 3600e3;
const now = Date.now();
const iso = (msAgo) => new Date(now - msAgo).toISOString();

const ORDER = () => [
  { id: 'o6', time: iso(0.5 * H), title: 'Đổi trạng thái: Chờ giao → Đang giao', actor: 'Nguyễn An', icon: 'send', tone: 'info', meta: 'Kho Hà Nội · GHN #A123' },
  { id: 'o5', time: iso(2 * H), title: 'Đã thanh toán 12.490.000₫', actor: { name: 'Trần Bình', href: '#nhan-vien-binh' }, icon: 'success', tone: 'success' },
  { id: 'o4', time: iso(26 * H), title: 'Sửa địa chỉ giao hàng', actor: 'Lê Chi', icon: 'pencil', details: 'Trước: 12 Hàng Bài, Hoàn Kiếm\nSau: 45 Lý Thường Kiệt, Hoàn Kiếm' },
  { id: 'o3', time: iso(50 * H), title: 'Tạo đơn hàng #DH-1024', actor: 'Website', icon: 'plus', href: '#don-1024' },
];

/** Order history: day groups ("Hôm nay" / "Hôm qua" / weekday), icons, tones, actor, meta, text details. */
export const OrderHistory = {
  render: () => '<td-timeline id="tl-order" time-zone="Asia/Ho_Chi_Minh"></td-timeline>',
  play: ({ canvasElement }) => {
    canvasElement.querySelector('#tl-order').items = ORDER();
  },
};

/** IMEI history with tones (decoration only: the title says what happened). */
export const ImeiTones = {
  render: () => '<td-timeline id="tl-imei" time-zone="Asia/Ho_Chi_Minh" group="none"></td-timeline>',
  play: ({ canvasElement }) => {
    canvasElement.querySelector('#tl-imei').items = [
      { time: iso(1 * H), title: 'Bán cho khách (HĐ 5521)', icon: 'success', tone: 'success' },
      { time: iso(30 * H), title: 'Bảo hành: thay màn hình', icon: 'warning', tone: 'warning' },
      { time: iso(80 * H), title: 'Khách trả lại — lỗi loa', icon: 'error', tone: 'danger' },
      { time: iso(200 * H), title: 'Nhập kho từ NCC', icon: 'upload', tone: 'info' },
    ];
  },
};

/** Audit with lazy details (`details: true` + renderDetails → a Node, here after 300 ms). */
export const AuditLazy = {
  render: () => '<td-timeline id="tl-audit" time-zone="Asia/Ho_Chi_Minh"></td-timeline>',
  play: ({ canvasElement }) => {
    const el = canvasElement.querySelector('#tl-audit');
    el.renderDetails = (item, { signal }) => new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        const dl = document.createElement('dl');
        for (const [k, v] of [['Trường', 'giá bán'], ['Trước', '12.990.000'], ['Sau', '12.490.000']]) {
          const dt = document.createElement('dt');
          dt.textContent = k;
          const dd = document.createElement('dd');
          dd.textContent = v;
          dl.append(dt, dd);
        }
        resolve(dl);
      }, 300);
      signal.addEventListener('abort', () => { clearTimeout(t); reject(signal.reason); });
    });
    el.items = [
      { id: 'a2', time: iso(3 * H), title: 'Sửa giá sản phẩm iPhone 15', actor: 'Admin', icon: 'pencil', details: true },
      { id: 'a1', time: iso(5 * H), title: 'Xoá ảnh sản phẩm', actor: 'Admin', icon: 'trash', tone: 'danger', details: true },
    ];
  },
};

/** "Xem thêm": loadMore simulated (300 ms, two more pages; the cursor is the last item shown). */
export const LoadMore = {
  render: () => '<td-timeline id="tl-more" time-zone="Asia/Ho_Chi_Minh" has-more></td-timeline>',
  play: ({ canvasElement }) => {
    const el = canvasElement.querySelector('#tl-more');
    let page = 0;
    el.loadMore = ({ signal, last }) => new Promise((resolve) => {
      const t = setTimeout(() => {
        page++;
        const base = last ? Date.parse(last.time) : now;
        resolve({
          items: Array.from({ length: 4 }, (_, i) => ({ id: `p${page}-${i}`, time: new Date(base - (i + 1) * 9 * H).toISOString(), title: `Sự kiện trang ${page + 1} · ${i + 1}` })),
          hasMore: page < 2,
        });
      }, 300);
      signal.addEventListener('abort', () => clearTimeout(t));
    });
    el.items = ORDER();
  },
};

/** No item: the empty text; `loading` without items: skeleton rows + aria-busy. */
export const EmptyAndLoading = {
  render: () => `<div><td-timeline time-zone="Asia/Ho_Chi_Minh" empty-text="Đơn này chưa có lịch sử"></td-timeline>
    <hr><td-timeline time-zone="Asia/Ho_Chi_Minh" loading></td-timeline></div>`,
};

/** 320px column: the time goes under the title. */
export const Narrow = {
  render: () => '<div class="sb-narrow"><td-timeline id="tl-narrow" time-zone="Asia/Ho_Chi_Minh"></td-timeline></div>',
  play: ({ canvasElement }) => {
    canvasElement.querySelector('#tl-narrow').items = ORDER();
  },
};
