import './td-tooltip.js';

export default {
  title: 'Feedback/Tooltip',
  tags: ['autodocs'],
};

export const Default = {
  render: () => `
    <div class="p-8">
      <button class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              data-tooltip="Day la tooltip mac dinh">
        Hover me
      </button>
    </div>
  `,
};

export const Positions = {
  render: () => `
    <div class="flex flex-wrap gap-6 p-16 justify-center">
      <button class="px-4 py-2 bg-gray-700 text-white rounded-lg"
              data-tooltip="Tooltip phia tren" data-tooltip-position="top">
        Top
      </button>
      <button class="px-4 py-2 bg-gray-700 text-white rounded-lg"
              data-tooltip="Tooltip phia duoi" data-tooltip-position="bottom">
        Bottom
      </button>
      <button class="px-4 py-2 bg-gray-700 text-white rounded-lg"
              data-tooltip="Tooltip ben trai" data-tooltip-position="left">
        Left
      </button>
      <button class="px-4 py-2 bg-gray-700 text-white rounded-lg"
              data-tooltip="Tooltip ben phai" data-tooltip-position="right">
        Right
      </button>
    </div>
  `,
};

export const CustomColor = {
  render: () => `
    <div class="flex flex-wrap gap-6 p-8">
      <button class="px-4 py-2 bg-purple-600 text-white rounded-lg"
              data-tooltip="Purple tooltip" data-tooltip-color="#8b5cf6">
        Purple
      </button>
      <button class="px-4 py-2 bg-green-600 text-white rounded-lg"
              data-tooltip="Green tooltip" data-tooltip-color="#22c55e">
        Green
      </button>
      <button class="px-4 py-2 bg-red-600 text-white rounded-lg"
              data-tooltip="Red tooltip" data-tooltip-color="#ef4444">
        Red
      </button>
    </div>
  `,
};

export const OnLinks = {
  render: () => `
    <div class="p-8 space-y-4">
      <p>
        Hover over the
        <a href="#" class="text-blue-600 underline" data-tooltip="Tooltip tren link">link nay</a>
        hoac
        <span class="font-bold text-purple-600 cursor-help" data-tooltip="Tooltip tren text in dam">text nay</span>
        de xem tooltip.
      </p>
      <p>
        <a href="#" class="text-green-600 underline" data-tooltip="Link voi tooltip vi tri duoi" data-tooltip-position="bottom">
          Link voi tooltip phia duoi
        </a>
      </p>
    </div>
  `,
};
