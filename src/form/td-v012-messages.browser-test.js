import { expect } from '@esm-bundle/chai';
import './td-checkbox.js';
import './td-toggle.js';
import './td-slider.js';

// v0.12.0 D21: constraint messages default to Vietnamese like every other control.
const mount = (html) => { const d = document.createElement('div'); d.innerHTML = html; document.body.appendChild(d); return d.firstElementChild; };

describe('Vietnamese constraint messages (D21)', () => {
  it('checkbox / toggle required', () => {
    expect(mount('<td-checkbox required label="x"></td-checkbox>').validationMessage).to.equal('Vui lòng chọn ô này.');
    expect(mount('<td-toggle required label="x"></td-toggle>').validationMessage).to.equal('Vui lòng bật tùy chọn này.');
  });
  it('slider range / step', () => {
    const s = mount('<td-slider min="10" max="20" step="5" value="10" aria-label="x"></td-slider>');
    s.value = 7;
    s.setAttribute('value', '7');
    expect(['Giá trị tối thiểu là 10.', 'Giá trị phải là bội số của 5.']).to.include(s.validationMessage);
  });
});
