/*
    Void
    GNOME Shell 46+ extension
    Copyright @fthx 2025
    License GPL v3
*/


import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Layout from 'resource:///org/gnome/shell/ui/layout.js'
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';


const HOT_EDGE_PRESSURE_TIMEOUT = 1000; // ms
const PRESSURE_THRESHOLD = 150; // > 0
const EDGE_SIZE = 100; // %
const UNLOCKED_PANEL_BUTTON_OPACITY = 128; // 0..254

const PanelLockButton = GObject.registerClass(
class PanelLockButton extends PanelMenu.Button {
    _init() {
        super._init();

        this._icon = new St.Icon({icon_name: 'focus-top-bar-symbolic', style_class: 'system-status-icon'});
        this.add_child(this._icon);

        this.opacity = UNLOCKED_PANEL_BUTTON_OPACITY;

        this.connectObject('button-press-event', this._onClicked.bind(this), this);
    }

    _onClicked() {
        if (this.opacity == 255)
            this.opacity = UNLOCKED_PANEL_BUTTON_OPACITY;
        else
            this.opacity = 255;
    }
});

const BottomEdge = GObject.registerClass(
class BottomEdge extends Clutter.Actor {
    _init(monitor, x, y) {
        super._init();

        this._monitor = monitor;
        this._x = x;
        this._y = y;

        this._edgeSize = EDGE_SIZE / 100;
        this._pressureThreshold = PRESSURE_THRESHOLD;

        this._pressureBarrier = new Layout.PressureBarrier(
            this._pressureThreshold,
            HOT_EDGE_PRESSURE_TIMEOUT,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW);

        this._pressureBarrier?.connectObject('trigger', this._toggleOverview.bind(this), this);

        this.connectObject('destroy', this._destroy.bind(this), this);
    }

    setBarrierSize(size) {
        if (this._barrier) {
            this._pressureBarrier?.removeBarrier(this._barrier);
            this._barrier.destroy();
            this._barrier = null;
        }

        if (size > 0) {
            size = this._monitor.width * this._edgeSize;
            let x_offset = (this._monitor.width - size) / 2;
            this._barrier = new Meta.Barrier({
                backend: global.backend,
                x1: this._x + x_offset, x2: this._x + x_offset + size,
                y1: this._y, y2: this._y,
                directions: Meta.BarrierDirection.NEGATIVE_Y});
            this._pressureBarrier?.addBarrier(this._barrier);
        }
    }

    _toggleOverview() {
        if (Main.overview.shouldToggleByCornerOrButton()
                && !(global.get_pointer()[2] & Clutter.ModifierType.BUTTON1_MASK)
                && !this._monitor.inFullscreen)
           Main.overview.toggle();
    }

    vfunc_leave_event(event) {
        return Clutter.EVENT_PROPAGATE;
    }

    _destroy() {
        this.setBarrierSize(0);

        this._pressureBarrier?.disconnectObject(this);
        this._pressureBarrier?.destroy();
        this._pressureBarrier = null;

        super.destroy();
    }
});

export default class VoidExtension {
    _showPanel() {
        if (Main.layoutManager.overviewGroup.get_children().includes(this._panelBox))
            Main.layoutManager.overviewGroup.remove_child(this._panelBox);
        if (Main.layoutManager.panelBox.get_parent() != Main.layoutManager.uiGroup)
            Main.layoutManager.addChrome(this._panelBox, {affectsStruts: true, trackFullscreen: true});

        Main.overview.searchEntry.get_parent().set_style('margin-top: 0px;');
    }

    _hidePanel() {
        if (Main.layoutManager.panelBox.get_parent() == Main.layoutManager.uiGroup)
            Main.layoutManager.removeChrome(this._panelBox);
        if (!Main.layoutManager.overviewGroup.get_children().includes(this._panelBox))
            Main.layoutManager.overviewGroup.insert_child_at_index(this._panelBox, 0);

        Main.overview.searchEntry.get_parent().set_style('margin-top: 32px;');
    }

    _toggleHideMode() {
        if (this._panelLockButton.opacity == 255)
            this._showPanel();
        else
            this._hidePanel();
    }

    _updateHotEdges() {
        Main.layoutManager._destroyHotCorners();

        for (let i = 0; i < Main.layoutManager.monitors.length; i++) {
            let monitor = Main.layoutManager.monitors[i];
            let leftX = monitor.x;
            let rightX = monitor.x + monitor.width;
            let bottomY = monitor.y + monitor.height;
            let size = monitor.width;

            let hasBottom = true;

            for (let j = 0; j < Main.layoutManager.monitors.length; j++) {
                if (j != i) {
                    let otherMonitor = Main.layoutManager.monitors[j];
                    let otherLeftX = otherMonitor.x;
                    let otherRightX = otherMonitor.x + otherMonitor.width;
                    let otherTopY = otherMonitor.y;

                    if (otherTopY >= bottomY && otherLeftX < rightX && otherRightX > leftX)
                        hasBottom = false;
                }
            }

            if (hasBottom) {
                let edge = new BottomEdge(monitor, leftX, bottomY);

                edge.setBarrierSize(size);
                Main.layoutManager.hotCorners.push(edge);
            } else
                Main.layoutManager.hotCorners.push(null);
        }
    }

    enable() {
        this._panelLockButton = new PanelLockButton();
        Main.panel.addToStatusArea('void-extension-panel-lock', this._panelLockButton);

        this._panelBox = Main.layoutManager.panelBox;
        this._hidePanel();
        this._panelLockButton.connectObject('notify::opacity', this._toggleHideMode.bind(this), this);

        Main.layoutManager.connectObject('hot-corners-changed', this._updateHotEdges.bind(this), this);
        this._updateHotEdges();
    }

    disable() {
        this._panelLockButton.destroy();
        this._panelLockButton = null;

        Main.layoutManager.disconnectObject(this);
        Main.layoutManager._updateHotCorners();

        this._showPanel();
        this._panelBox = null;
    }
}
