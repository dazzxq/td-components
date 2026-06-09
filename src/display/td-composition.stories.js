import './td-table.js';
import '../form/td-input-field.js';
import '../form/td-dropdown.js';
import '../form/td-button.js';
import { TdModal } from '../feedback/td-modal.js';
import { TdToast } from '../feedback/td-toast.js';
import { TdLoading } from '../feedback/td-loading.js';

export default {
  title: 'Examples/Composition',
  tags: ['autodocs'],
};

export const TableWithActions = {
  render: () => `<td-table id="action-table"></td-table>`,
  play: ({ canvasElement }) => {
    const table = canvasElement.querySelector('#action-table');

    table.columns = [
      { key: 'name', label: 'Tên', sortable: true },
      { key: 'email', label: 'Email' },
      { key: 'role', label: 'Vai trò' },
      {
        key: 'actions',
        label: 'Thao tác',
        align: 'center',
        render: (value, row) => {
          const container = document.createElement('div');
          container.className = 'flex gap-2 justify-center';

          const viewBtn = document.createElement('button');
          viewBtn.className = 'px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors';
          viewBtn.textContent = 'Xem';
          viewBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            TdModal.show({
              title: `Chi tiết: ${row.name}`,
              body: `
                <div class="space-y-2">
                  <p><strong>Tên:</strong> ${row.name}</p>
                  <p><strong>Email:</strong> ${row.email}</p>
                  <p><strong>Vai trò:</strong> ${row.role}</p>
                </div>
              `,
            });
          });

          const deleteBtn = document.createElement('button');
          deleteBtn.className = 'px-3 py-1 text-xs bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors';
          deleteBtn.textContent = 'Xóa';
          deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const ok = await TdModal.confirm({
              title: 'Xác nhận xóa',
              message: `Bạn có chắc chắn muốn xóa "${row.name}"?`,
              confirmVariant: 'danger',
              confirmText: 'Xóa',
            });
            if (ok) {
              TdToast.success(`Đã xóa "${row.name}"!`);
            }
          });

          container.appendChild(viewBtn);
          container.appendChild(deleteBtn);
          return container;
        },
      },
    ];

    table.data = [
      { name: 'Nguyen Van A', email: 'a@example.com', role: 'Admin' },
      { name: 'Tran Thi B', email: 'b@example.com', role: 'Editor' },
      { name: 'Le Van C', email: 'c@example.com', role: 'Viewer' },
      { name: 'Pham Thi D', email: 'd@example.com', role: 'Editor' },
    ];
  },
};

export const FormAndFeedback = {
  render: () => `
    <div class="max-w-md mx-auto p-6 bg-white rounded-xl border border-gray-200 space-y-4">
      <h3 class="text-lg font-bold text-gray-900">Tạo người dùng mới</h3>

      <td-input-field id="comp-name" label="Họ tên" placeholder="Nhập họ tên"></td-input-field>

      <td-dropdown id="comp-role" label="Vai trò" placeholder="Chọn vai trò"></td-dropdown>

      <td-button id="comp-submit" variant="primary" label="Lưu người dùng" full-width></td-button>
    </div>
  `,
  play: ({ canvasElement }) => {
    const dropdown = canvasElement.querySelector('#comp-role');
    if (dropdown) {
      dropdown.options = [
        { value: 'admin', label: 'Admin' },
        { value: 'editor', label: 'Editor' },
        { value: 'viewer', label: 'Viewer' },
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
