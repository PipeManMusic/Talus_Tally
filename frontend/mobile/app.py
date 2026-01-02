import asyncio

import toga
from toga.style import Pack
from toga.style.pack import COLUMN, ROW
import json
import os
import uuid
from datetime import datetime, timezone
from backend.models import Project, Status, Task, WorkPackage, SubProject
from backend.persistence import PersistenceManager
from backend.engine import PriorityEngine
from backend.sync import SyncManager, DropboxSyncConflict

LIFTS_DOWNTIME_LABELS = {
    10: "System Enabler",
    8: "Daily-Drive Friendly",
    6: "Weekend Warrior",
    4: "Major Surgery",
    2: "Cosmetic",
}


def _downtime_label(value):
    if value is None:
        return "Unspecified"
    return LIFTS_DOWNTIME_LABELS.get(value, f"Custom ({value})")


def _patch_toga_detailedlist_right_click():
    try:
        from toga_gtk.widgets.detailedlist import DetailedList as GtkDetailedList
    except Exception:
        return

    if getattr(GtkDetailedList, "_talus_tamed", False):
        return

    original_handler = GtkDetailedList.gtk_on_right_click

    def safe_right_click(self, gesture, n_press, x, y):
        item_impl = self.native_detailedlist.get_row_at_y(y)
        if item_impl is None:
            return
        return original_handler(self, gesture, n_press, x, y)

    GtkDetailedList.gtk_on_right_click = safe_right_click
    GtkDetailedList._talus_tamed = True


_patch_toga_detailedlist_right_click()

try:
    from .secrets import DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN
except ImportError:
    DROPBOX_APP_KEY = None
    DROPBOX_APP_SECRET = None
    DROPBOX_REFRESH_TOKEN = None

class TalusMobile(toga.App):
    def startup(self):
        # 0. Remove default menus (File, Edit, View, etc.)
        # The user wants a pure touch UI without desktop-style pull-down menus.
        self.commands.clear()
        
        self.engine = PriorityEngine()

        # 1. Setup Main Window
        self.main_window = toga.MainWindow(title=self.formal_name)
        
        # 2. Define Layout Containers
        self.list_view = toga.Box(style=Pack(direction=COLUMN, margin=10))
        
        # 3. Header & Controls (Custom Action Bar)
        header_box = toga.Box(style=Pack(direction=ROW, margin_bottom=10, align_items="center"))
        
        header_label = toga.Label(
            "Talus Tally",
            style=Pack(font_weight='bold', font_size=16, flex=1)
        )
        header_box.add(header_label)
        
        # Add Button
        self.add_btn = toga.Button(
            "+",
            on_press=self.show_create_task,
            style=Pack(margin_left=5, width=40)
        )
        header_box.add(self.add_btn)

        # Save Button (Top Right)
        self.save_btn = toga.Button(
            "Save",
            on_press=self.save_data,
            style=Pack(margin_left=5),
            enabled=False
        )
        header_box.add(self.save_btn)
        self._default_save_text = "Save"
        
        self.list_view.add(header_box)

        # 3.5 Filters
        filter_box = toga.Box(style=Pack(direction=ROW, margin_bottom=5))
        self.show_completed_switch = toga.Switch(
            "Show Completed",
            on_change=self.refresh_table,
            value=True
        )
        filter_box.add(self.show_completed_switch)
        
        self.list_view.add(filter_box)

        # 4. Data List (DetailedList supports Pull-to-Refresh)
        self.task_list = toga.DetailedList(
            data=[],
            on_select=self.on_task_select,
            on_refresh=self.load_from_disk, # Pull-to-refresh handler
            style=Pack(flex=1)
        )
        self.list_view.add(self.task_list)

        # 5. Create Task View (Hidden by default)
        self.create_view = self.build_create_view()
        
        # 6. Edit Task View (Hidden by default)
        self.edit_view = self.build_edit_view()

        # 7. Initial Data Load
        self.data_path = os.path.join(self.paths.data, "talus_master.json")
        self.persistence = PersistenceManager(self.data_path)
        self.sync = self._create_sync_manager()
        self.project = None
        self.active_tasks = [] # List of (task, wp, sub) tuples matching table rows
        self.is_dirty = False
        self.is_busy = False
        self.load_from_disk(None)

        self.main_window.content = self.list_view
        self.main_window.show()

    def _handle_window_dialog(self, dialog) -> bool:
        handler = getattr(self.main_window, "dialog", None)
        if not handler:
            return False

        result = handler(dialog)
        if asyncio.iscoroutine(result):
            try:
                loop = asyncio.get_running_loop()
                loop.create_task(result)
            except RuntimeError:
                asyncio.run(result)
        return True

    def _show_info(self, title: str, message: str):
        if self._handle_window_dialog(toga.InfoDialog(title, message)):
            return
        legacy = getattr(self.main_window, "info_dialog", None)
        if legacy:
            return legacy(title, message)

    def _show_error(self, title: str, message: str):
        if self._handle_window_dialog(toga.ErrorDialog(title, message)):
            return
        legacy = getattr(self.main_window, "error_dialog", None)
        if legacy:
            return legacy(title, message)

    async def _ask_question(self, title: str, message: str):
        handler = getattr(self.main_window, "dialog", None)
        if handler:
            result = handler(toga.QuestionDialog(title, message))
            if asyncio.iscoroutine(result):
                return await result
            return result
        legacy = getattr(self.main_window, "question_dialog", None)
        if legacy:
            return await legacy(title, message)
        raise RuntimeError("No question dialog handler available")

    def _clear_task_selection(self):
        impl = getattr(self.task_list, "_impl", None)
        if not impl:
            return
        native = getattr(impl, "native_detailedlist", None)
        if native is None:
            return
        try:
            native.select_row(None)
        except TypeError:
            try:
                native.unselect_all()
            except AttributeError:
                pass

    def build_create_view(self):
        box = toga.Box(style=Pack(direction=COLUMN, margin=10))
        
        # Header
        box.add(toga.Label("New Task", style=Pack(font_weight='bold', font_size=18, margin_bottom=15)))
        
        # --- Sub Project Section ---
        box.add(toga.Label("Sub Project:", style=Pack(margin_bottom=5)))
        
        self.sub_container = toga.Box(style=Pack(direction=ROW, margin_bottom=15))
        
        self.sub_select = toga.Selection(items=[], on_change=self.on_sub_change, style=Pack(flex=1))
        self.sub_input = toga.TextInput(placeholder="New Sub Project Name", style=Pack(flex=1))
        
        self.sub_toggle_btn = toga.Button("+", on_press=self.toggle_sub_mode, style=Pack(width=40, margin_left=5))
        
        # Start with Select mode
        self.sub_container.add(self.sub_select)
        self.sub_container.add(self.sub_toggle_btn)
        self.is_new_sub = False
        
        box.add(self.sub_container)
        
        # --- Work Package Section ---
        box.add(toga.Label("Work Package:", style=Pack(margin_bottom=5)))
        
        self.wp_container = toga.Box(style=Pack(direction=ROW, margin_bottom=15))
        
        self.wp_select = toga.Selection(items=[], style=Pack(flex=1))
        self.wp_input = toga.TextInput(placeholder="New Work Package Name", style=Pack(flex=1))
        
        self.wp_toggle_btn = toga.Button("+", on_press=self.toggle_wp_mode, style=Pack(width=40, margin_left=5))
        
        # Start with Select mode
        self.wp_container.add(self.wp_select)
        self.wp_container.add(self.wp_toggle_btn)
        self.is_new_wp = False
        
        box.add(self.wp_container)
        
        # Task Name
        box.add(toga.Label("Task Name:", style=Pack(margin_bottom=5)))
        self.task_input = toga.TextInput(style=Pack(margin_bottom=15))
        box.add(self.task_input)
        
        # Cost
        box.add(toga.Label("Estimated Cost ($):", style=Pack(margin_bottom=5)))
        self.cost_input = toga.NumberInput(step=0.01, style=Pack(margin_bottom=20))
        box.add(self.cost_input)
        
        # Buttons
        btn_box = toga.Box(style=Pack(direction=ROW, margin_top=10))
        
        cancel_btn = toga.Button(
            "Cancel", 
            on_press=self.cancel_create,
            style=Pack(flex=1, margin_right=5)
        )
        create_btn = toga.Button(
            "Create Task", 
            on_press=self.confirm_create,
            style=Pack(flex=1, margin_left=5)
        )
        
        btn_box.add(cancel_btn)
        btn_box.add(create_btn)
        box.add(btn_box)
        
        return box

    def build_edit_view(self):
        box = toga.Box(style=Pack(direction=COLUMN, margin=10))
        
        # Header
        box.add(toga.Label("Edit Task", style=Pack(font_weight='bold', font_size=18, margin_bottom=15)))
        
        # Task Name
        box.add(toga.Label("Task Name:", style=Pack(margin_bottom=5)))
        self.edit_task_input = toga.TextInput(style=Pack(margin_bottom=15))
        box.add(self.edit_task_input)
        
        # Status
        box.add(toga.Label("Status:", style=Pack(margin_bottom=5)))
        self.edit_status_select = toga.Selection(
            items=[s.value.replace("_", " ").title() for s in Status],
            style=Pack(margin_bottom=15)
        )
        box.add(self.edit_status_select)
        
        # Estimated Cost
        box.add(toga.Label("Estimated Cost ($):", style=Pack(margin_bottom=5)))
        self.edit_est_cost_input = toga.NumberInput(step=0.01, style=Pack(margin_bottom=15))
        box.add(self.edit_est_cost_input)
        
        # Actual Cost
        box.add(toga.Label("Actual Cost ($):", style=Pack(margin_bottom=5)))
        self.edit_act_cost_input = toga.NumberInput(step=0.01, style=Pack(margin_bottom=20))
        box.add(self.edit_act_cost_input)
        
        # Buttons
        btn_box = toga.Box(style=Pack(direction=ROW, margin_top=10))
        
        delete_btn = toga.Button(
            "Delete",
            on_press=self.delete_task,
            style=Pack(flex=1, margin_right=5, background_color="red", color="white") 
            # Note: Toga styling support varies by platform, but we'll try to hint it's destructive
        )
        
        cancel_btn = toga.Button(
            "Cancel", 
            on_press=self.cancel_edit,
            style=Pack(flex=1, margin_right=5, margin_left=5)
        )
        save_btn = toga.Button(
            "Save Changes", 
            on_press=self.confirm_edit,
            style=Pack(flex=1, margin_left=5)
        )
        
        btn_box.add(delete_btn)
        btn_box.add(cancel_btn)
        btn_box.add(save_btn)
        box.add(btn_box)
        
        return box

    def toggle_sub_mode(self, widget):
        # Clear container
        self.sub_container.remove(self.sub_toggle_btn)
        if self.is_new_sub:
            self.sub_container.remove(self.sub_input)
        else:
            self.sub_container.remove(self.sub_select)
            
        if self.is_new_sub:
            # Switch to Select
            self.sub_container.add(self.sub_select)
            self.sub_toggle_btn.text = "+"
            self.is_new_sub = False
            # Re-trigger change to update WPs
            self.on_sub_change(self.sub_select)
        else:
            # Switch to New
            self.sub_container.add(self.sub_input)
            self.sub_toggle_btn.text = "x"
            self.is_new_sub = True
            # If Sub is new, WP must be new
            if not self.is_new_wp:
                self.toggle_wp_mode(None)
            self.wp_select.items = [] 

        self.sub_container.add(self.sub_toggle_btn)

    def toggle_wp_mode(self, widget):
        if self.is_new_wp and self.is_new_sub:
               self._show_info("Info", "New Sub-Project requires a New Work Package.")
               return

        # Clear container
        self.wp_container.remove(self.wp_toggle_btn)
        if self.is_new_wp:
            self.wp_container.remove(self.wp_input)
        else:
            self.wp_container.remove(self.wp_select)

        if self.is_new_wp:
            # Switch to Select
            self.wp_container.add(self.wp_select)
            self.wp_toggle_btn.text = "+"
            self.is_new_wp = False
        else:
            # Switch to New
            self.wp_container.add(self.wp_input)
            self.wp_toggle_btn.text = "x"
            self.is_new_wp = True
            
        self.wp_container.add(self.wp_toggle_btn)

    def show_create_task(self, widget):
        if not self.project: return
        
        # Reset to select mode if needed
        if self.is_new_sub: self.toggle_sub_mode(None)
        if self.is_new_wp: self.toggle_wp_mode(None)
        
        # Populate Sub Projects
        subs = [s.name for s in self.project.sub_projects]
        self.sub_select.items = subs
        
        # Trigger update for WPs
        if subs:
            self.sub_select.value = subs[0]
            self.on_sub_change(self.sub_select)
            
        # Clear inputs
        self.task_input.value = ""
        self.cost_input.value = 0.0
        self.sub_input.value = ""
        self.wp_input.value = ""
        
        self.main_window.content = self.create_view

    def on_sub_change(self, widget):
        # Update WP list based on selected Sub
        if not self.project: return
        
        selected_sub_name = widget.value
        if not selected_sub_name:
            self.wp_select.items = []
            return
            
        # Find the sub object
        sub = next((s for s in self.project.sub_projects if s.name == selected_sub_name), None)
        if sub:
            wps = [w.name for w in sub.work_packages]
            self.wp_select.items = wps
            if wps:
                self.wp_select.value = wps[0]

    def cancel_create(self, widget):
        self.main_window.content = self.list_view

    def confirm_create(self, widget):
        if not self.task_input.value:
            self._show_error("Error", "Task name is required.")
            return
            
        # Handle Sub Project
        if self.is_new_sub:
            sub_name = self.sub_input.value
            if not sub_name:
                self._show_error("Error", "Sub Project name is required.")
                return
            # Create Sub
            sub = SubProject(id=str(uuid.uuid4()), name=sub_name)
            self.project.sub_projects.append(sub)
        else:
            sub_name = self.sub_select.value
            if not sub_name:
                self._show_error("Error", "Must select Sub Project.")
                return
            sub = next((s for s in self.project.sub_projects if s.name == sub_name), None)
            
        # Handle Work Package
        if self.is_new_wp:
            wp_name = self.wp_input.value
            if not wp_name:
                self._show_error("Error", "Work Package name is required.")
                return
            # Create WP
            wp = WorkPackage(id=str(uuid.uuid4()), name=wp_name)
            sub.work_packages.append(wp)
        else:
            wp_name = self.wp_select.value
            if not wp_name:
                self._show_error("Error", "Must select Work Package.")
                return
            wp = next((w for w in sub.work_packages if w.name == wp_name), None)
        
        # Create Task
        new_task = Task(
            id=str(uuid.uuid4()),
            text=self.task_input.value,
            estimated_cost=float(self.cost_input.value or 0),
            status=Status.PENDING
        )
        
        wp.tasks.append(new_task)
        
        self.mark_dirty()
        self.refresh_table(None)
        self.main_window.content = self.list_view
        self._show_info("Success", "Task created!")

    def mark_dirty(self):
        self.is_dirty = True
        self._update_save_button()
        self._update_title()

    def mark_clean(self):
        self.is_dirty = False
        self._update_save_button()
        self._update_title()

    def _update_save_button(self):
        if self.is_busy:
            self.save_btn.enabled = False
            return
        self.save_btn.enabled = self.is_dirty

    def _update_title(self):
        suffix = " *" if self.is_dirty else ""
        if self.is_busy:
            self.main_window.title = f"{self.formal_name} (Saving...){suffix}"
        else:
            self.main_window.title = f"{self.formal_name}{suffix}"

    def _begin_busy(self, message="Saving..."):
        if self.is_busy:
            return
        self.is_busy = True
        self.add_btn.enabled = False
        self.task_list.enabled = False
        self.show_completed_switch.enabled = False
        self.save_btn.text = message
        self._update_save_button()
        self._update_title()

    def _end_busy(self):
        if not self.is_busy:
            return
        self.is_busy = False
        self.add_btn.enabled = True
        self.task_list.enabled = True
        self.show_completed_switch.enabled = True
        self.save_btn.text = self._default_save_text
        self._update_save_button()
        self._update_title()

    def _create_sync_manager(self):
        if os.environ.get("TALUS_TALLY_DISABLE_DROPBOX"):
            return None

        refresh_token = os.environ.get("DROPBOX_REFRESH_TOKEN") or DROPBOX_REFRESH_TOKEN
        app_key = os.environ.get("DROPBOX_APP_KEY") or DROPBOX_APP_KEY
        app_secret = os.environ.get("DROPBOX_APP_SECRET") or DROPBOX_APP_SECRET
        access_token = os.environ.get("DROPBOX_ACCESS_TOKEN")

        try:
            if refresh_token and app_key and app_secret:
                return SyncManager(
                    refresh_token=refresh_token,
                    app_key=app_key,
                    app_secret=app_secret,
                )
            if access_token:
                return SyncManager(access_token=access_token)
        except Exception as e:
            print(f"Sync Init Error: {e}")
        return None

    def sync_from_cloud(self):
        if not self.sync:
            print("Dropbox credentials not found or sync disabled. Skipping sync.")
            return False

        try:
            print("Attempting Dropbox download...")
            if self.sync.download_db(self.data_path):
                print("Dropbox download successful.")
                return True
            print("Dropbox download failed or file not found.")
        except Exception as e:
            print(f"Sync Error: {e}")
        return False

    def sync_to_cloud(self):
        if not self.sync:
            return True

        try:
            print("Attempting Dropbox upload...")
            if self.sync.upload_db(self.data_path):
                print("Dropbox upload successful.")
                return True
            print("Dropbox upload failed.")
        except DropboxSyncConflict:
            self._show_error(
                "Sync Conflict",
                "Dropbox has a newer copy of this project. Pull-to-refresh before saving again.",
            )
        except Exception as e:
            print(f"Sync Error: {e}")
            self._show_error(
                "Sync Error",
                "Failed to upload to Dropbox. Changes remain on this device.",
            )
        return False

    def load_from_disk(self, widget):
        if self.is_dirty:
            pass

        self.sync_from_cloud()

        if not os.path.exists(self.data_path):
            # No local data found. Start with a fresh project.
            self.project = Project(name="New Project", sub_projects=[])
            self.mark_dirty()
            self.refresh_table(None)
            return

        try:
            with open(self.data_path, "r") as f:
                # We use the existing Pydantic model! Code Reuse! 🚀
                self.project = Project.model_validate(json.load(f))
            
            self.mark_clean()
            self.refresh_table(None)
            
        except Exception as e:
            self._show_error("Load Error", str(e))

    def _runtime_blocked_ids(self):
        if not self.project:
            return set()

        task_lookup = {}
        for sub in self.project.sub_projects:
            for wp in sub.work_packages:
                for task in wp.tasks:
                    task_lookup[task.id] = task

        blocked_ids = set()
        for task in task_lookup.values():
            if getattr(task, "blocking", None) and task.status != Status.COMPLETE:
                for blocked_id in task.blocking:
                    if blocked_id in task_lookup:
                        blocked_ids.add(blocked_id)
        return blocked_ids

    def _is_runtime_blocked(self, task, blocked_ids):
        return task.id in blocked_ids and task.status != Status.COMPLETE

    def refresh_table(self, widget):
        if not self.project: return

        # Collect all tasks first to sort by velocity
        all_tasks = []
        
        show_completed = self.show_completed_switch.value
        blocked_ids = self._runtime_blocked_ids()
        
        for sub in self.project.sub_projects:
            for wp in sub.work_packages:
                for task in wp.tasks:
                    # Filter based on switch
                    if not show_completed and task.status == Status.COMPLETE:
                        continue
                    
                    forced_blocked = self._is_runtime_blocked(task, blocked_ids)
                    # Calculate Scores
                    velocity = self.engine.calculate_task_score(
                        sub.priority,
                        wp.importance,
                        task,
                        forced_blocked=forced_blocked,
                    )
                    combined = self.engine.calculate_combined_priority(
                        sub.priority,
                        wp.importance,
                        task,
                        base_score=velocity,
                        forced_blocked=forced_blocked,
                    )
                    all_tasks.append({
                        "task": task,
                        "sub": sub,
                        "wp": wp,
                        "score": combined,
                        "velocity": velocity,
                        "downtime": task.budget_priority,
                        "blocked": forced_blocked,
                    })
        
        # Sort by Score Descending (Highest Velocity First)
        all_tasks.sort(key=lambda x: x["score"], reverse=True)
        
        list_data = []
        self.active_tasks = []
        
        for item in all_tasks:
            task = item["task"]
            sub = item["sub"]
            wp = item["wp"]
            combined = item["score"]
            velocity = item["velocity"]
            downtime_value = item["downtime"]
            downtime_text = _downtime_label(downtime_value)
            forced_blocked = item["blocked"]

            # DetailedList expects title, subtitle, icon (optional)
            row_title = f"{task.text}"
            row_status = "BLOCKED" if forced_blocked else task.status.value.replace("_", " ").upper()
            row_cost = f"${task.estimated_cost:,.2f}"
            # Add Score to subtitle for visibility
            row_subtitle = (
                f"[{combined:.1f}] {row_status} | {row_cost} | {downtime_text}"
                f" | Velocity {velocity:.1f} | {sub.name} > {wp.name}"
            )
            
            # Insert into list
            list_item = {
                "title": row_title,
                "subtitle": row_subtitle,
                "task": task
            }
            list_data.append(list_item)
            self.active_tasks.append(task)
        
        self.task_list.data = list_data

    def save_data(self, widget):
        if not self.project: return
        self._begin_busy()
        try:
            self.project.last_updated = datetime.now(timezone.utc).isoformat()
            self.persistence.save(self.project)

            if self.sync_to_cloud():
                self._show_info("Saved", "Project updated successfully!")
                self.mark_clean()
                self.load_from_disk(None) # Refresh view
        except Exception as e:
            self._show_error("Save Error", str(e))
        finally:
            self._end_busy()

    def on_task_select(self, widget):
        # DetailedList selection is accessed via widget.selection
        row = widget.selection
        if not row: return # Deselection
        
        try:
            self.current_editing_task = row.task
            self.show_edit_task(self.current_editing_task)
        except Exception as e:
            self._show_error("Error", f"Could not open task: {str(e)}")

    def show_edit_task(self, task):
        # Populate fields
        self.edit_task_input.value = task.text
        self.edit_est_cost_input.value = task.estimated_cost
        self.edit_act_cost_input.value = task.actual_cost
        
        # Set Status
        status_str = task.status.value.replace("_", " ").title()
        self.edit_status_select.value = status_str
        
        self.main_window.content = self.edit_view

    async def delete_task(self, widget):
        if not self.current_editing_task: return
        
        should_delete = await self._ask_question(
            "Delete Task?",
            f"Are you sure you want to delete '{self.current_editing_task.text}'?"
        )
        
        if should_delete:
            # Find and remove the task
            task_id = self.current_editing_task.id
            found = False
            for sub in self.project.sub_projects:
                for wp in sub.work_packages:
                    # Check if task is in this WP
                    # We iterate a copy or use index to remove safely
                    for i, t in enumerate(wp.tasks):
                        if t.id == task_id:
                            wp.tasks.pop(i)
                            found = True
                            break
                    if found: break
                if found: break
            
            if found:
                self.mark_dirty()
                self.refresh_table(None)
                self.main_window.content = self.list_view
                self._clear_task_selection()
                self.current_editing_task = None
                self._show_info("Deleted", "Task removed.")
            else:
                self._show_error("Error", "Could not find task to delete.")

    def cancel_edit(self, widget):
        self.current_editing_task = None
        self.main_window.content = self.list_view
        self._clear_task_selection() # Clear selection so we can re-select same row

    def confirm_edit(self, widget):
        if not self.current_editing_task: return
        
        if not self.edit_task_input.value:
            self._show_error("Error", "Task name is required.")
            return
            
        # Update Task
        self.current_editing_task.text = self.edit_task_input.value
        self.current_editing_task.estimated_cost = float(self.edit_est_cost_input.value or 0)
        self.current_editing_task.actual_cost = float(self.edit_act_cost_input.value or 0)
        
        # Map status string back to Enum
        status_str = self.edit_status_select.value
        # Reverse lookup
        for s in Status:
            if s.value.replace("_", " ").title() == status_str:
                self.current_editing_task.status = s
                break
        
        self.mark_dirty()
        self.refresh_table(None)
        self.main_window.content = self.list_view
        self.task_list.selection = None
        self.current_editing_task = None

def main():
    return TalusMobile("Talus Tally", "com.talus.tally")

if __name__ == "__main__":
    app = main()
    app.main_loop()