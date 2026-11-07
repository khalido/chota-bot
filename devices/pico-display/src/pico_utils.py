import os


def filesystem_info():
    statvfs = os.statvfs("/")
    total_kb = (statvfs[0] * statvfs[2]) / 1024
    free_kb = (statvfs[0] * statvfs[3]) / 1024
    print(f"Total: {total_kb:.0f} KB, Free: {free_kb:.0f} KB")