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
      { key: 'name', label: 'Ten', sortable: true },
      { key: 'email', label: 'Email' },
      { key: 'role', label: 'Vai tro' },
      {
        key: 'actions',
        label: 'Thao tac',
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
              title: `Chi tiet: ${row.name}`,
              body: `
                <div class="space-y-2">
                  <p><strong>Ten:</strong> ${row.name}</p>
                  <p><strong>Email:</strong> ${row.email}</p>
                  <p><strong>Vai tro:</strong> ${row.role}</p>
                </div>
              `,
            });
          });

          const deleteBtn = document.createElement('button');
          deleteBtn.className = 'px-3 py-1 text-xs bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors';
          deleteBtn.textContent = 'Xoa';
          deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const ok = await TdModal.confirm({
              title: 'Xac nhan xoa',
              message: `Ban co chac chan muon xoa "${row.name}"?`,
              confirmVariant: 'danger',
              confirmText: 'Xoa',
            });
            if (ok) {
              TdToast.success(`Da xoa "${row.name}"!`);
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
      <h3 class="text-lg font-bold text-gray-900">Tao nguoi dung moi</h3>

      <td-input-field id="comp-name" label="Ho ten" placeholder="Nhap ho ten"></td-input-field>

      <td-dropdown id="comp-role" label="Vai tro" placeholder="Chon vai tro"></td-dropdown>

      <td-button id="comp-submit" variant="primary" label="Luu nguoi dung" full-width></td-button>
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
        if (nameField) nameField.setError('Vui long nhap ho ten');
        TdToast.warning('Vui long dien day du thong tin!');
        return;
      }

      TdLoading.show('Dang luu nguoi dung...');
      await new Promise(r => setTimeout(r, 1500));
      TdLoading.hide();
      TdToast.success(`Da tao nguoi dung "${name}" thanh cong!`);
    });
  },
};
