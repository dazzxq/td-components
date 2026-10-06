/**
 * v0.53.0 M2 regression fixture (plan v0.53.0-menu-custom-item QĐ 1): menus WITHOUT a custom item must render
 * byte-identical to v0.52.0. These lists were rendered by the v0.52.0 TdMenu (main 566b310) into
 * menu-v052-dom.json; td-v053-menu-custom.browser-test.js renders them again and compares.
 */
const noop = () => {};
export const MENU_SNAPSHOT_LISTS = {
  plain: { items: () => [{ label: 'Sửa', onSelect: noop }, { label: 'Chia sẻ', id: 'share', icon: 'link' }, { separator: true },
    { label: 'Xoá', danger: true, onSelect: noop }] },
  checkable: { items: () => [{ label: 'Lưới', type: 'radio', group: 'v', checked: true }, { label: 'Danh sách', type: 'radio', group: 'v' },
    { separator: true }, { label: 'Hiện ẩn', type: 'checkbox', checked: false }, { label: 'Ghim', checked: false }] },
  hints: { items: () => [{ label: 'Sửa', hint: 'E' }, { label: 'Khoá', disabled: true, hint: 'Không có quyền' }, { separator: true },
    { separator: true }, { label: 'Báo cáo', hint: 'Gửi cho quản trị viên' }], opts: { label: 'Thao tác', align: 'start' } },
  links: { items: () => [{ label: 'Mở', href: '/posts/7', newTab: true }, { label: 'Tải', href: '/a.jpg', download: 'anh.jpg' },
    { label: 'Thư', href: 'mailto:a@b.c' }, { label: 'Tải 2', href: '/b.jpg', download: true }] },
  named: { name: 'v053-snap', define: [{ label: 'Một' }, { label: 'Hai', order: 30 }],
    register: [[{ label: 'Plugin' }], { group: 'p', order: 20 }],
    items: () => 'v053-snap' },
};

/**
 * Ids are sequence numbers (td-menu-{n}, td-menu-trigger-{n}) and the CSSOM geometry (top / left / max-height) depends
 * on where the trigger sits: normalise both before comparing.
 */
export const normaliseMenuHtml = (html) => html.replace(/ style="[^"]*"/g, '')
  .replace(/td-menu-trigger-\d+/g, 'td-menu-trigger-N').replace(/td-menu-\d+/g, 'td-menu-N');
