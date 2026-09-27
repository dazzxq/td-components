import './td-table.js';
import '../form/td-input-field.js';
import '../form/td-dropdown.js';
import '../form/td-button.js';
import { TdModal } from '../feedback/td-modal.js';
import { TdToast } from '../feedback/td-toast.js';
import { TdLoading } from '../feedback/td-loading.js';
import '../styles/story-layout.css';

export default {
  title: 'Examples/Composition',
  tags: ['autodocs'],
};

export const TableWithActions = {
  render: () => '<td-table id="action-table" title="Người dùng"></td-table>',
  play: ({ canvasElement }) => {
    const table = canvasElement.querySelector('#action-table');

    /** Modal body built as Nodes: row data is set with textContent, never interpolated into HTML. */
    const detailBody = (row) => {
      const wrap = document.createElement('div');
      for (const [label, value] of [['Tên', row.name], ['Email', row.email], ['Vai trò', row.role]]) {
        const p = document.createElement('p');
        const strong = document.createElement('strong');
        strong.textContent = `${label}: `;
        p.append(strong, document.createTextNode(value));
        wrap.appendChild(p);
      }
      return wrap;
    };

    const button = (text, variant, name) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `td-btn td-btn--${variant} td-btn--sm`;
      btn.textContent = text;
      btn.setAttribute('aria-label', `${text} ${name}`);
      return btn;
    };

    table.columns = [
      { key: 'name', label: 'Tên', sortable: true },
      { key: 'email', label: 'Email' },
      { key: 'role', label: 'Vai trò' },
      {
        key: 'actions',
        label: 'Thao tác',
        align: 'right',
        // Signature: render(row, rowIdxInPage) → a Node (preferred).
        render: (row) => {
          const container = document.createElement('div');
          container.className = 'sb-row';
          container.style.setProperty('justify-content', 'flex-end'); // a flex row ignores the column's text-align

          const viewBtn = button('Xem', 'secondary', row.name);
          viewBtn.addEventListener('click', () => {
            TdModal.show({ title: `Chi tiết: ${row.name}`, body: detailBody(row) });
          });

          const deleteBtn = button('Xóa', 'danger', row.name);
          deleteBtn.addEventListener('click', async () => {
            const ok = await TdModal.confirm({
              title: 'Xác nhận xóa',
              message: `Bạn có chắc chắn muốn xóa "${row.name}"?`,
              confirmVariant: 'danger',
              confirmText: 'Xóa',
            });
            if (ok) TdToast.success(`Đã xóa "${row.name}"!`);
          });

          container.append(viewBtn, deleteBtn);
          return container;
        },
      },
    ];

    table.data = [
      { name: 'Nguyễn Văn A', email: 'a@example.com', role: 'Quản trị' },
      { name: 'Trần Thị B', email: 'b@example.com', role: 'Biên tập' },
      { name: 'Lê Văn C', email: 'c@example.com', role: 'Xem' },
      { name: 'Phạm Thị D', email: 'd@example.com', role: 'Biên tập' },
    ];
  },
};

export const FormAndFeedback = {
  render: () => `
    <div class="sb-stack">
      <h3>Tạo người dùng mới</h3>

      <td-input-field id="comp-name" label="Họ tên" placeholder="Nhập họ tên"></td-input-field>

      <td-dropdown id="comp-role" label="Vai trò" placeholder="Chọn vai trò"></td-dropdown>

      <td-button id="comp-submit" variant="primary" label="Lưu người dùng" full-width></td-button>
    </div>
  `,
  play: ({ canvasElement }) => {
    const dropdown = canvasElement.querySelector('#comp-role');
    if (dropdown) {
      dropdown.options = [
        { value: 'admin', label: 'Quản trị' },
        { value: 'editor', label: 'Biên tập' },
        { value: 'viewer', label: 'Xem' },
      ];
    }

    const submitBtn = canvasElement.querySelector('#comp-submit');
    submitBtn.addEventListener('click', async () => {
      const nameField = canvasElement.querySelector('#comp-name');
      const name = nameField ? nameField.getValue() : '';

      if (!name) {
        if (nameField) nameField.setError('Vui lòng nhập họ tên');
        TdToast.warning('Vui lòng điền đầy đủ thông tin!');
        return;
      }

      TdLoading.show('Đang lưu người dùng...');
      await new Promise(r => setTimeout(r, 1500));
      TdLoading.hide();
      TdToast.success(`Đã tạo người dùng "${name}" thành công!`);
    });
  },
};
